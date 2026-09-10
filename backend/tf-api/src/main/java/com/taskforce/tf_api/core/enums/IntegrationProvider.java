package com.taskforce.tf_api.core.enums;

public enum IntegrationProvider {
    GITHUB,
    SLACK,
    PLANE,
    /** Clé API Anthropic du workspace (chiffrée), pour la délégation Claude (TF-AGENT-DELIVERY B1). */
    ANTHROPIC
}
