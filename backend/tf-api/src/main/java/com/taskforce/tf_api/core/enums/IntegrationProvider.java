package com.taskforce.tf_api.core.enums;

public enum IntegrationProvider {
    GITHUB,
    SLACK,
    PLANE,
    /** Clé API Anthropic du workspace (chiffrée), pour la délégation Claude (TF-AGENT-DELIVERY B1). */
    ANTHROPIC,
    /** Clé API Cursor du workspace (chiffrée), pour la délégation aux Background Agents Cursor (TF-AGENT-DELIVERY). */
    CURSOR
}
