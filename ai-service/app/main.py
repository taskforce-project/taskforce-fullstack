"""Point d'entrée du service : passerelle vers un fournisseur d'IA compatible OpenAI (chat et embeddings)."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import FastAPI

from app import __version__
from app.config import Settings, settings as default_settings
from app.routers import chat, embeddings, health
from app.services.provider import Opener, ProviderGateway
from app.services.status import ProviderStatus

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service")


def create_app(settings: Optional[Settings] = None, opener: Optional[Opener] = None) -> FastAPI:
    """Assemble l'application. ``settings`` et ``opener`` servent aux tests (fournisseur simulé)."""
    settings = settings or default_settings
    app = FastAPI(title="taskforce-ai-service", version=__version__)
    gateway = ProviderGateway(settings, opener)
    app.state.settings = settings
    app.state.gateway = gateway
    app.state.status = ProviderStatus(settings, gateway)
    app.include_router(health.router)
    app.include_router(chat.router)
    app.include_router(embeddings.router)
    if not settings.service_token:
        logger.warning("AI_SERVICE_TOKEN is not set: every /v1 call will be refused")
    return app


app = create_app()
