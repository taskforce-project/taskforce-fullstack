package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/**
 * Provider d'agent de livraison exposé au picker « déléguer à... » (TF-AGENT-DELIVERY).
 * {@code available=false} = coupé sur l'instance. {@code ready=false} = pas encore utilisable par cette personne
 * (ou sur ce projet), {@code reason} dit quoi faire (OSS-5.7).
 */
public record DeliveryProviderResponse(
    String key,
    String displayName,
    String logoKey,
    boolean available,
    List<String> models,
    boolean ready,
    String reason
) {}
