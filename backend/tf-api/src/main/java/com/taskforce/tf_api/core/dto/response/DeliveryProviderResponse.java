package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/**
 * Provider d'agent de livraison exposé au picker « déléguer à... » (TF-AGENT-DELIVERY).
 * {@code available=false} = affiché « à venir » (dispatch pas encore câblé).
 */
public record DeliveryProviderResponse(
    String key,
    String displayName,
    String logoKey,
    boolean available,
    List<String> models
) {}
