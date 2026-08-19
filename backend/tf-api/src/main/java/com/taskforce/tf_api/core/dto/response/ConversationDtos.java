package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/** DTOs des conversations Cortex (liste + détail + message). */
public final class ConversationDtos {

    private ConversationDtos() {}

    /** Résumé pour la liste (historique). */
    public record ConversationSummary(Long id, String title, String updatedAt, int messageCount, long totalTokens) {}

    /** Message d'une conversation. */
    public record MessageDto(Long id, String role, String content, String mode, long totalTokens, String createdAt) {}

    /** Détail : conversation + messages + empreinte tokens (jauge de contexte). */
    public record ConversationDetail(Long id, String title, long totalTokens, List<MessageDto> messages) {}
}
