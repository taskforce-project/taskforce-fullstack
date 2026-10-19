package com.taskforce.tf_api.core.dto.response;

import java.util.Map;

/** Défi de connexion par passkey : son identifiant, et les options à passer au navigateur (JSON de WebAuthn). */
public record PasskeySignInOptionsResponse(String requestId, Map<String, Object> options) {}
