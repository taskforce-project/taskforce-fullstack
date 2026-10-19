package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

/**
 * Session de l'app desktop. {@code token} n'est rendu qu'à l'ouverture de la session ; il est null quand l'app relit
 * son compte.
 */
public record DesktopSessionResponse(String token, LocalDateTime expiresAt, DesktopAccountResponse account) {}
