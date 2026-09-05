"""Passerelle LLM : proxy vers **Ollama** (API OpenAI-compatible), en `urllib` (stdlib, zéro dépendance).

C'est ici que vit le **routing modèle** — le backend Java ne connaît pas le modèle, il appelle le
gateway. Point d'extension naturel : ajouter d'autres providers / du reranking / un modèle Coder.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import List, Optional

from app.config import Settings

logger = logging.getLogger("ai-service.gateway")


def _with_thinking(messages: List[dict], think: bool) -> List[dict]:
    """Injecte ``/no_think`` (Qwen3) sur le dernier message quand le raisonnement n'est pas voulu.

    Copie superficielle : on ne mute pas la liste de l'appelant. En mode ``think`` on ne touche à rien.
    """
    if think or not messages:
        return messages
    out = list(messages)
    last = dict(out[-1])
    content = str(last.get("content", "")).rstrip()
    if "/no_think" not in content:
        last["content"] = (content + " /no_think").strip()
    out[-1] = last
    return out


class OllamaGatewayError(RuntimeError):
    """Erreur d'appel au LLM local (indisponible, réponse invalide…)."""


class OllamaGateway:
    """Passerelle `chat/completions` : Ollama local par défaut, **Groq** (hébergé) si `GROQ_API_KEY`.

    Ollama comme Groq exposent une API *OpenAI-compatible* → le même code sert les deux, seuls changent
    l'URL, l'en-tête d'auth et les noms de modèles. Les EMBEDDINGS restent TOUJOURS sur Ollama (Groq n'en
    fournit pas). La sélection est automatique au démarrage selon la présence de la clé Groq.
    """

    def __init__(self, settings: Settings) -> None:
        self._use_groq = settings.use_groq
        # --- CHAT : Groq (hébergé) si clé présente, sinon Ollama local ---
        if self._use_groq:
            self._chat_url = settings.groq_base_url.rstrip("/") + "/chat/completions"
            self._default_model = settings.groq_model
            self._fast_model = settings.groq_model_fast
            self._api_key = settings.groq_api_key.strip()
        else:
            self._chat_url = settings.ollama_base_url.rstrip("/") + "/v1/chat/completions"
            self._default_model = settings.ollama_model
            self._fast_model = settings.ollama_model_fast
            self._api_key = ""
        # --- EMBEDDINGS : toujours Ollama (Groq n'expose pas d'endpoint d'embeddings) ---
        self._embed_url = settings.ollama_base_url.rstrip("/") + "/api/embed"
        self._embed_model = settings.ollama_embed_model
        self._timeout_s = settings.ollama_timeout_s

    @property
    def provider(self) -> str:
        """``"groq"`` (chat hébergé) ou ``"ollama"`` (chat local). Les embeddings sont toujours Ollama."""
        return "groq" if self._use_groq else "ollama"

    @property
    def default_model(self) -> str:
        return self._default_model

    def resolve_tier(self, tier: Optional[str]) -> tuple[str, bool]:
        """Route un *tier* logique vers ``(modèle, think)``. Le gateway possède le routing modèle.

        - ``fast``     → 8B, sans raisonnement (petites actions, chat interactif).
        - ``deep``     → 14B, **avec** raisonnement Qwen3 (analyse profonde, plus lent).
        - ``standard`` → 14B, sans raisonnement (génération courante). Défaut.
        """
        if tier == "fast":
            return self._fast_model, False
        if tier == "deep":
            return self._default_model, True
        return self._default_model, False

    @property
    def embed_model(self) -> str:
        return self._embed_model

    def embed(self, texts: List[str], model: Optional[str] = None) -> List[List[float]]:
        """Calcule les embeddings via Ollama (``/api/embed``). Retourne une liste de vecteurs.

        Lève :class:`OllamaGatewayError` si Ollama est indisponible ou la réponse invalide.
        """
        body = {"model": model or self._embed_model, "input": texts}
        request = urllib.request.Request(
            self._embed_url,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout_s) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError) as exc:
            logger.error("Ollama embeddings injoignable (%s): %s", self._embed_url, exc)
            raise OllamaGatewayError(f"Embeddings locaux indisponibles: {exc}") from exc

        vectors = payload.get("embeddings")
        if not isinstance(vectors, list) or not vectors:
            raise OllamaGatewayError("Réponse d'embeddings invalide (pas de 'embeddings')")
        return [[float(x) for x in vector] for vector in vectors]

    def chat(
        self,
        messages: List[dict],
        model: Optional[str] = None,
        tools: Optional[List[dict]] = None,
        json_mode: bool = False,
        temperature: float = 0.4,
        tier: Optional[str] = None,
        think: bool = False,
    ) -> tuple[str, dict, dict]:
        """Appelle le LLM. Retourne ``(model_utilisé, message_assistant, usage)``.

        ``usage`` = compteurs de tokens renvoyés par l'endpoint OpenAI-compatible d'Ollama
        (``{prompt_tokens, completion_tokens, total_tokens}``) — ``{}`` si absent.

        Routing : ``tier`` (fast/standard/deep) est prioritaire ; sinon ``model`` explicite (ou défaut)
        + ``think``. Sans raisonnement, on injecte ``/no_think`` (Qwen3) — nettement plus rapide.
        Le ``message`` peut contenir ``tool_calls`` (boucle agentique côté backend).
        Lève :class:`OllamaGatewayError` en cas d'indisponibilité ou de réponse invalide.
        """
        if tier is not None:
            resolved_model, resolved_think = self.resolve_tier(tier)
        else:
            resolved_model, resolved_think = (model or self._default_model), think
        # `/no_think` est une directive Qwen3 (Ollama) : inutile/parasite côté Groq (Llama) → on l'omet.
        prepared_messages = messages if self._use_groq else _with_thinking(messages, resolved_think)
        body: dict = {
            "model": resolved_model,
            "messages": prepared_messages,
            "temperature": temperature,
            "stream": False,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        # User-Agent applicatif OBLIGATOIRE : Groq est derrière Cloudflare, qui renvoie 403 aux
        # requêtes dont l'UA est `Python-urllib/x.y` (défaut urllib). Sans lui, tout appel Groq échoue.
        headers = {"Content-Type": "application/json", "User-Agent": "TaskForce-AI/1.0"}
        if self._api_key:                                  # Groq exige le Bearer ; Ollama local n'en a pas
            headers["Authorization"] = f"Bearer {self._api_key}"

        # Repli sur les outils : un serveur MCP riche (Linear) peut faire dépasser la limite de payload
        # du provider (Groq → 413) OU exposer un schéma d'outil que Groq refuse (400). Plutôt que
        # d'échouer, on ré-essaie avec MOINS d'outils (dichotomie, tronqués par la fin) jusqu'à ce que ça
        # passe. Les outils sont déjà priorisés côté backend (les plus pertinents d'abord) → on garde le
        # préfixe utile. Rend Cortex résilient à n'importe quel serveur MCP.
        attempt_tools = list(tools) if tools else None
        payload = None
        while True:
            if attempt_tools:
                body["tools"] = attempt_tools
                body["tool_choice"] = "auto"
            else:
                body.pop("tools", None)
                body.pop("tool_choice", None)
            request = urllib.request.Request(
                self._chat_url,
                data=json.dumps(body).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            try:
                with urllib.request.urlopen(request, timeout=self._timeout_s) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as exc:
                if exc.code in (400, 413) and attempt_tools:
                    keep = len(attempt_tools) // 2
                    logger.warning(
                        "Groq %s avec %d outil(s) → retry avec %d (payload/schéma d'outil rejeté)",
                        exc.code, len(attempt_tools), keep)
                    attempt_tools = attempt_tools[:keep] if keep > 0 else None
                    continue
                logger.error("LLM chat injoignable — provider=%s (%s): %s", self.provider, self._chat_url, exc)
                raise OllamaGatewayError(f"LLM ({self.provider}) indisponible: {exc}") from exc
            except (urllib.error.URLError, TimeoutError) as exc:
                logger.error("LLM chat injoignable — provider=%s (%s): %s", self.provider, self._chat_url, exc)
                raise OllamaGatewayError(f"LLM ({self.provider}) indisponible: {exc}") from exc

        choices = payload.get("choices") or []
        if not choices:
            raise OllamaGatewayError("Réponse LLM sans 'choices'")
        usage = payload.get("usage") or {}
        return resolved_model, choices[0].get("message", {}), usage
