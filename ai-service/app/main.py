"""Point d'entrée du service — assemble l'application (app factory).

TaskForce AI Service : AI Gateway (LLM local Ollama) + embeddings + scoring smart-assign.
La logique vit dans ``app.services`` ; les contrats dans ``app.schemas`` ; chaque domaine a son
router dans ``app.routers``.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI

from app import __version__
from app.routers import chat, embeddings, health, smart_assign

logging.basicConfig(level=logging.INFO)


def create_app() -> FastAPI:
    app = FastAPI(title="taskforce-ai-service", version=__version__)
    app.include_router(health.router)
    app.include_router(chat.router)
    app.include_router(embeddings.router)
    app.include_router(smart_assign.router)
    return app


app = create_app()
