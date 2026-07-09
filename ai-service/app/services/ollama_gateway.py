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
    """Client `chat/completions` vers Ollama, avec timeout adapté à la génération locale."""

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.ollama_base_url.rstrip("/")
        self._default_model = settings.ollama_model
        self._fast_model = settings.ollama_model_fast
        self._embed_model = settings.ollama_embed_model
        self._timeout_s = settings.ollama_timeout_s

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
            f"{self._base_url}/api/embed",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout_s) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError) as exc:
            logger.error("Ollama embeddings injoignable (%s): %s", self._base_url, exc)
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
    ) -> tuple[str, dict]:
        """Appelle le LLM. Retourne ``(model_utilisé, message_assistant)``.

        Routing : ``tier`` (fast/standard/deep) est prioritaire ; sinon ``model`` explicite (ou défaut)
        + ``think``. Sans raisonnement, on injecte ``/no_think`` (Qwen3) — nettement plus rapide.
        Le ``message`` peut contenir ``tool_calls`` (boucle agentique côté backend).
        Lève :class:`OllamaGatewayError` en cas d'indisponibilité ou de réponse invalide.
        """
        if tier is not None:
            resolved_model, resolved_think = self.resolve_tier(tier)
        else:
            resolved_model, resolved_think = (model or self._default_model), think
        body: dict = {
            "model": resolved_model,
            "messages": _with_thinking(messages, resolved_think),
            "temperature": temperature,
            "stream": False,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"

        request = urllib.request.Request(
            f"{self._base_url}/v1/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout_s) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError) as exc:
            logger.error("Ollama injoignable (%s): %s", self._base_url, exc)
            raise OllamaGatewayError(f"LLM local indisponible: {exc}") from exc

        choices = payload.get("choices") or []
        if not choices:
            raise OllamaGatewayError("Réponse LLM sans 'choices'")
        return resolved_model, choices[0].get("message", {})
