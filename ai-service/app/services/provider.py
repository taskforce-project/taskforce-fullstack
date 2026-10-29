"""Client du fournisseur d'IA : API compatible OpenAI (``/chat/completions``, ``/embeddings``, ``/models``).

En ``urllib`` (bibliothèque standard, aucune dépendance). Le backend Java ne connaît ni le fournisseur ni le modèle :
il demande un *tier* (``fast``, ``standard``, ``deep``), traduit ici en modèle.
"""
from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from typing import Callable, List, Optional, Tuple

from app.config import Settings

logger = logging.getLogger("ai-service.provider")

# User-Agent applicatif obligatoire : Groq est derrière Cloudflare, qui répond 403 à l'UA par défaut d'urllib.
USER_AGENT = "TaskForce-AI/1.0"

_THINK_BLOCK = re.compile(r"<think>.*?</think>\s*", re.DOTALL)

Opener = Callable[..., object]


class ProviderError(RuntimeError):
    """Fournisseur injoignable, requête refusée ou réponse invalide."""


class NotConfiguredError(ProviderError):
    """IA coupée par la configuration (``AI_PROVIDER=none``)."""


class ToolsRefusedError(ProviderError):
    """Le fournisseur refuse les outils, jusqu'au dernier : l'agent ne doit pas répondre comme s'il en avait."""


def is_qwen3(model: str) -> bool:
    """Vrai pour un modèle Qwen3 (``qwen3:8b``, ``qwen/qwen3-32b``…), seul à comprendre ``/no_think``."""
    return "qwen3" in model.lower()


def with_no_think(messages: List[dict], model: str, think: bool) -> List[dict]:
    """Ajoute ``/no_think`` au dernier message d'un modèle Qwen3 quand le raisonnement n'est pas voulu.

    Directive propre à Qwen3 (réponse bien plus rapide) : tout autre modèle la recevrait comme du texte. Copie
    superficielle, la liste de l'appelant n'est pas modifiée.
    """
    if think or not messages or not is_qwen3(model):
        return messages
    out = list(messages)
    last = dict(out[-1])
    content = str(last.get("content") or "").rstrip()
    if "/no_think" not in content:
        last["content"] = (content + " /no_think").strip()
    out[-1] = last
    return out


def strip_thinking(message: dict) -> dict:
    """Retire un bloc ``<think>…</think>`` resté dans le contenu (Qwen3 qui raisonne).

    Les appelants attendent la réponse seule, parfois un JSON à analyser.
    """
    content = message.get("content")
    if isinstance(content, str) and "<think>" in content:
        message = dict(message)
        message["content"] = _THINK_BLOCK.sub("", content).strip()
    return message


def _is_failed_tool_call(exc: urllib.error.HTTPError) -> bool:
    """Vrai pour le 400 `tool_use_failed` de Groq : le modèle a produit un appel d'outil invalide."""
    try:
        return b"tool_use_failed" in exc.read()
    except Exception:  # noqa: BLE001 - corps illisible : ce n'est pas ce cas
        return False


class ProviderGateway:
    """Appels au fournisseur configuré. ``opener`` est injectable pour les tests (défaut : ``urlopen``)."""

    def __init__(self, settings: Settings, opener: Optional[Opener] = None) -> None:
        self._settings = settings
        self._open = opener or urllib.request.urlopen

    def resolve_tier(self, tier: Optional[str]) -> Tuple[str, bool]:
        """``fast`` : petit modèle sans raisonnement ; ``deep`` : modèle principal avec raisonnement ;
        ``standard`` (défaut) : modèle principal sans raisonnement."""
        if tier == "fast":
            return self._settings.model_fast, False
        if tier == "deep":
            return self._settings.model, True
        return self._settings.model, False

    def _call(self, url: str, body: Optional[dict], api_key: str, timeout: float) -> dict:
        headers = {"Content-Type": "application/json", "User-Agent": USER_AGENT}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(url, data=data, headers=headers, method="POST" if body is not None else "GET")
        with self._open(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    def _ensure_enabled(self) -> None:
        if not self._settings.enabled:
            raise NotConfiguredError("AI is turned off on this instance (AI_PROVIDER=none)")

    def chat(
        self,
        messages: List[dict],
        model: Optional[str] = None,
        tools: Optional[List[dict]] = None,
        json_mode: bool = False,
        temperature: float = 0.4,
        tier: Optional[str] = None,
        think: bool = False,
    ) -> Tuple[str, dict, dict]:
        """Complétion. Retourne ``(modèle, message assistant, usage)`` ; le message peut porter des ``tool_calls``."""
        self._ensure_enabled()
        if tier is not None:
            resolved_model, resolved_think = self.resolve_tier(tier)
        else:
            resolved_model, resolved_think = (model or self._settings.model), think
        body: dict = {
            "model": resolved_model,
            "messages": with_no_think(messages, resolved_model, resolved_think),
            "temperature": temperature,
            "stream": False,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        if not resolved_think and self._settings.chat_provider == "ollama" and is_qwen3(resolved_model):
            # Ollama 0.40 ignore `/no_think` : Qwen3 raisonnait à chaque réponse. Son réglage natif coupe le
            # raisonnement (même appel d'outil : 2,9 s puis 0,5 s, mesuré le 29/10/2026).
            body["reasoning_effort"] = "none"

        url = self._settings.chat_base_url + "/chat/completions"
        attempt_tools = list(tools) if tools else None
        # Groq refuse (400 `tool_use_failed`) une réponse où le modèle a mal formé un appel d'outil : c'est un tirage
        # raté, pas un outil de trop. On redemande une fois avec les mêmes outils avant d'en retirer (29/10/2026).
        retried_generation = False
        while True:
            if attempt_tools:
                body["tools"] = attempt_tools
                body["tool_choice"] = "auto"
            else:
                body.pop("tools", None)
                body.pop("tool_choice", None)
            try:
                payload = self._call(url, body, self._settings.chat_api_key, self._settings.timeout_s)
                break
            except urllib.error.HTTPError as exc:
                if exc.code == 400 and attempt_tools and not retried_generation and _is_failed_tool_call(exc):
                    logger.warning("Provider rejected a malformed tool call from the model: asking again")
                    retried_generation = True
                    continue
                # Un serveur MCP riche peut dépasser la taille de requête du fournisseur (413) ou exposer un schéma
                # d'outil qu'il refuse (400) : on réessaie avec moitié moins d'outils. Le backend les trie par
                # pertinence, on garde donc le début de la liste. Jamais jusqu'à zéro : sans outils, le modèle
                # annonçait des actions qu'il n'avait pas faites (recette du 29/10/2026). L'appelant le sait.
                if exc.code in (400, 413) and attempt_tools:
                    keep = len(attempt_tools) // 2
                    if keep == 0:
                        logger.error("Provider answered %s even with a single tool: the tools are refused", exc.code)
                        raise ToolsRefusedError(f"AI provider refused the tools (HTTP {exc.code})") from exc
                    logger.warning("Provider answered %s with %d tool(s), retrying with %d",
                                   exc.code, len(attempt_tools), keep)
                    attempt_tools = attempt_tools[:keep]
                    continue
                raise ProviderError(f"AI provider refused the request (HTTP {exc.code})") from exc
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
                raise ProviderError(f"AI provider unreachable: {exc}") from exc

        choices = payload.get("choices") or []
        if not choices:
            raise ProviderError("AI provider answered without choices")
        return resolved_model, strip_thinking(choices[0].get("message") or {}), payload.get("usage") or {}

    def embed(self, texts: List[str]) -> List[List[float]]:
        """Vecteurs des textes, dans l'ordre. La dimension doit être celle de la base (``EMBEDDING_DIM``)."""
        self._ensure_enabled()
        if not texts:
            return []
        url = self._settings.embed_base_url + "/embeddings"
        try:
            payload = self._call(url, {"model": self._settings.embed_model, "input": texts},
                                 self._settings.embed_api_key, self._settings.timeout_s)
        except urllib.error.HTTPError as exc:
            raise ProviderError(f"Embeddings refused (HTTP {exc.code})") from exc
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            raise ProviderError(f"Embeddings unreachable: {exc}") from exc

        data = payload.get("data")
        if not isinstance(data, list) or len(data) != len(texts):
            raise ProviderError("Invalid embeddings response")
        rows = sorted(data, key=lambda row: row.get("index", 0))
        vectors = [[float(x) for x in (row.get("embedding") or [])] for row in rows]
        expected = self._settings.embedding_dim
        for vector in vectors:
            if len(vector) != expected:
                raise ProviderError(
                    f"Embedding model {self._settings.embed_model} returns {len(vector)} dimensions, "
                    f"the database expects {expected}")
        return vectors

    def probe(self, base_url: str, api_key: str) -> bool:
        """Vrai si le fournisseur répond sur ``GET /models`` dans un délai court."""
        try:
            self._call(base_url + "/models", None, api_key, timeout=3)
            return True
        except Exception:  # noqa: BLE001 - toute erreur veut dire « indisponible »
            return False
