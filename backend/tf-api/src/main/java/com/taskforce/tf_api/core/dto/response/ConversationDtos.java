package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/** DTOs des conversations Cortex (liste + détail + message). */
public final class ConversationDtos {

    private ConversationDtos() {}

    /** Résumé pour la liste (historique) ; {@code projectId} : le projet où elle a commencé, null sans projet. */
    public record ConversationSummary(Long id, String title, String updatedAt, int messageCount, long totalTokens,
                                      Long projectId) {}

    /**
     * Message d'une conversation ; {@code model} : celui qui a écrit la réponse, null pour une demande ou un repli ;
     * {@code read} : ce que TaskForce lui a donné à lire (la ligne grise, R123), null sans lecture gardée.
     */
    public record MessageDto(Long id, String role, String content, String mode, long totalTokens, String createdAt,
                             String model, AssistantAnswer.AssistantRead read) {}

    /** Détail : conversation + messages + empreinte tokens (jauge de contexte). */
    public record ConversationDetail(Long id, String title, long totalTokens, List<MessageDto> messages) {}

    /** Ce que « /compact » a fait : les messages condensés dans le résumé ; 0 quand il n'y avait rien à condenser. */
    public record Compaction(int summarized) {}
}
