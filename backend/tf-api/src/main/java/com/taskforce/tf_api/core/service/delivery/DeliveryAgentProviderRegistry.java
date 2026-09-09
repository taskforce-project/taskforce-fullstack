package com.taskforce.tf_api.core.service.delivery;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

/**
 * Registre des providers d'agents de livraison (collecte tous les {@link DeliveryAgentProvider} déclarés
 * en beans), sur le même patron que {@code AgentToolRegistry}. Alimente le picker « déléguer à... »
 * (TF-AGENT-DELIVERY). L'ordre d'insertion (ordre des beans) est conservé pour un affichage stable.
 */
@Component
public class DeliveryAgentProviderRegistry {

    private final Map<String, DeliveryAgentProvider> byKey = new LinkedHashMap<>();

    public DeliveryAgentProviderRegistry(List<DeliveryAgentProvider> providers) {
        for (DeliveryAgentProvider p : providers) {
            byKey.put(p.key(), p);
        }
    }

    /** Tous les providers, dans l'ordre d'enregistrement. */
    public List<DeliveryAgentProvider> all() {
        return List.copyOf(byKey.values());
    }

    /** Provider par clé, ou {@code null} si inconnu. */
    public DeliveryAgentProvider get(String key) {
        return key == null ? null : byKey.get(key);
    }
}
