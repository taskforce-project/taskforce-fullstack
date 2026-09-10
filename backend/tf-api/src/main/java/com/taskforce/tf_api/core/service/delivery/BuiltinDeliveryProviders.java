package com.taskforce.tf_api.core.service.delivery;

import java.util.List;

import org.springframework.stereotype.Component;

/**
 * Providers d'agents de livraison « métadonnées seulement » (TF-AGENT-DELIVERY).
 * Les providers <b>exécutables</b> vivent dans leur propre fichier ({@link ClaudeApiProvider},
 * {@link CursorProvider}, {@link CopilotProvider}, {@link StubDeliveryProvider}). Ici ne reste que ce
 * qui n'est pas encore câblé. Chaque bean est collecté par {@link DeliveryAgentProviderRegistry}.
 */
final class BuiltinDeliveryProviders {
    private BuiltinDeliveryProviders() {}
}

/**
 * Claude Code « bout-en-bout » (clone dépôt + édits agentiques + PR via Managed Agents) : c'est la
 * suite de {@link ClaudeApiProvider} (qui, lui, fait déjà l'appel Messages synchrone). {@code available=false}
 * tant que l'exécution agentique hébergée n'est pas câblée.
 */
@Component
class ClaudeCodeProvider implements DeliveryAgentProvider {
    @Override public String key() { return "claude-code"; }
    @Override public String displayName() { return "Claude Code"; }
    @Override public String logoKey() { return "anthropic"; } // logo vendorisé (SVGL)
    @Override public boolean available() { return false; } // suite : dispatch agentique via Managed Agents
    @Override public List<String> models() { return List.of("claude-opus-5", "claude-sonnet-5"); }
}
