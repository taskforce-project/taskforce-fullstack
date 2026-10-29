"""Fournisseur simulé : remplace ``urlopen`` et enregistre les requêtes reçues."""
from __future__ import annotations

import io
import json
import urllib.error
from typing import Callable, Dict, List, Optional, Union

import pytest
from fastapi.testclient import TestClient

from app.config import load_settings
from app.main import create_app

TOKEN = "test-token"

Reply = Union[dict, Exception, Callable[[dict], Union[dict, Exception]]]


class _Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


class FakeProvider:
    """Réponses par suffixe d'URL (``/chat/completions``, ``/embeddings``, ``/models``)."""

    def __init__(self) -> None:
        self.replies: Dict[str, List[Reply]] = {}
        self.requests: List[dict] = []

    def reply(self, suffix: str, *answers: Reply) -> "FakeProvider":
        self.replies.setdefault(suffix, []).extend(answers)
        return self

    def __call__(self, request, timeout: Optional[float] = None):
        body = json.loads(request.data.decode("utf-8")) if request.data else None
        self.requests.append({"url": request.full_url, "method": request.get_method(), "body": body,
                              "headers": dict(request.header_items()), "timeout": timeout})
        for suffix, answers in self.replies.items():
            if request.full_url.endswith(suffix) and answers:
                answer = answers.pop(0) if len(answers) > 1 else answers[0]
                if callable(answer):
                    answer = answer(body)
                if isinstance(answer, Exception):
                    raise answer
                return _Response(json.dumps(answer).encode("utf-8"))
        raise urllib.error.URLError("connection refused")


def http_error(code: int, body: bytes = b"{}") -> urllib.error.HTTPError:
    return urllib.error.HTTPError("http://provider", code, "error", {}, io.BytesIO(body))


@pytest.fixture
def provider() -> FakeProvider:
    return FakeProvider()


def make_client(provider: FakeProvider, **env: str) -> TestClient:
    settings = load_settings({"AI_SERVICE_TOKEN": TOKEN, **env})
    return TestClient(create_app(settings, opener=provider))


AUTH = {"Authorization": f"Bearer {TOKEN}"}
