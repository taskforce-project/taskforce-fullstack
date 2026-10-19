package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Un webhook sortant. {@code lastStatus} : code HTTP du dernier envoi, null quand le serveur n'a pas répondu ou
 * que rien n'est encore parti ({@code lastFiredAt} null).
 */
public record WebhookResponse(
    Long id,
    String url,
    List<String> eventTypes,
    boolean active,
    LocalDateTime lastFiredAt,
    Integer lastStatus,
    LocalDateTime createdAt
) {}
