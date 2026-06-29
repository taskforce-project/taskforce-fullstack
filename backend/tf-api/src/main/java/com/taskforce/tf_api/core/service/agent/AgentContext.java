package com.taskforce.tf_api.core.service.agent;

/** Contexte d'exécution d'un outil agentique (déjà autorisé). */
public record AgentContext(String slug, Long workspaceId, Long userId) {}
