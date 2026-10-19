"""Secret partagé avec le backend : toute route ``/v1`` exige ``Authorization: Bearer <AI_SERVICE_TOKEN>``.

Le service n'est joignable que sur le réseau interne de Docker ; le secret est une seconde barrière, par exemple
contre une requête forgée depuis un autre conteneur. Sans secret configuré, le service refuse tout (fermé par
défaut) plutôt que de servir n'importe qui.
"""
from __future__ import annotations

import hmac
from typing import Optional

from fastapi import Header, HTTPException, Request


def require_token(request: Request, authorization: Optional[str] = Header(default=None)) -> None:
    expected = request.app.state.settings.service_token
    if not expected:
        raise HTTPException(status_code=503, detail="AI_SERVICE_TOKEN is not set: the AI service refuses every call")
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid service token")
