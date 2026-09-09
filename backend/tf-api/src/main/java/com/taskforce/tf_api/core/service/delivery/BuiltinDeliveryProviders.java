package com.taskforce.tf_api.core.service.delivery;

import java.util.List;

import org.springframework.stereotype.Component;

/**
 * Providers d'agents de livraison fournis par défaut (TF-AGENT-DELIVERY, slice 2).
 * Métadonnées uniquement pour l'instant ({@code available=false}) : le dispatch réel arrive en slice 3
 * (Claude Code d'abord). Chaque provider est un bean → collecté par {@link DeliveryAgentProviderRegistry}.
 */
final class BuiltinDeliveryProviders {
    private BuiltinDeliveryProviders() {}
}

@Component
class ClaudeCodeProvider implements DeliveryAgentProvider {
    @Override public String key() { return "claude-code"; }
    @Override public String displayName() { return "Claude Code"; }
    @Override public String logoKey() { return "claude"; }
    @Override public boolean available() { return false; } // slice 3 : dispatch via Managed Agents
    @Override public List<String> models() { return List.of("claude-opus", "claude-sonnet"); }
}

@Component
class CopilotProvider implements DeliveryAgentProvider {
    @Override public String key() { return "github-copilot"; }
    @Override public String displayName() { return "GitHub Copilot"; }
    @Override public String logoKey() { return "githubcopilot"; }
    @Override public boolean available() { return false; }
    @Override public List<String> models() { return List.of("gpt", "claude"); }
}

@Component
class CursorProvider implements DeliveryAgentProvider {
    @Override public String key() { return "cursor"; }
    @Override public String displayName() { return "Cursor"; }
    @Override public String logoKey() { return "cursor"; }
    @Override public boolean available() { return false; }
    @Override public List<String> models() { return List.of("auto"); }
}
