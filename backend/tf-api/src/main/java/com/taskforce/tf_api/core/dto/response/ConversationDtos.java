package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/** DTOs des conversations Cortex (liste + détail + message). */
public final class ConversationDtos {

    private ConversationDtos() {}

    /** Résumé pour la liste (historique) ; {@code projectId} : le projet où elle travaille (R135), null sans projet. */
    public record ConversationSummary(Long id, String title, String updatedAt, int messageCount, long totalTokens,
                                      Long projectId) {}

    /**
     * Message d'une conversation ; {@code model} : celui qui a écrit la réponse, null pour une demande ou un repli ;
     * {@code read} : ce que TaskForce lui a donné à lire (la ligne grise, R123), null sans lecture gardée ;
     * {@code files} : ce que la personne a joint à sa demande (R134), par leurs noms.
     */
    public record MessageDto(Long id, String role, String content, String mode, long totalTokens, String createdAt,
                             String model, AssistantAnswer.AssistantRead read, List<MessageFile> files) {
        public MessageDto {
            files = files == null ? List.of() : List.copyOf(files);
        }
    }

    /** Un fichier joint à une demande : son nom. Son contenu reste au serveur, le modèle le relit avec l'historique. */
    public record MessageFile(String name) {}

    /** Détail : conversation + messages + empreinte tokens (jauge de contexte) + le projet où elle travaille (R135). */
    public record ConversationDetail(Long id, String title, long totalTokens, List<MessageDto> messages, Long projectId) {}

    /**
     * Ce que « /compact » a fait : les messages condensés dans le résumé (0 quand il n'y avait rien à condenser), ce résumé
     * tel qu'il se lit sous sa ligne, et ce qu'il reste à envoyer au modèle : l'historique ({@code historyTokens}), compté
     * tout de suite, et la fenêtre où il tient, pour que la jauge prenne sa nouvelle valeur sans attendre la prochaine
     * réponse. {@code contextTokens} : tout ce qui partirait maintenant, consignes et outils compris ; la fenêtre est null
     * quand personne ne la dit.
     */
    public record Compaction(int summarized, String summary, int historyTokens, int contextTokens, Integer contextWindow,
                             boolean contextEstimated) {

        /** Rien à condenser : la jauge garde sa mesure. */
        public static final Compaction NOTHING = new Compaction(0, null, 0, 0, null, false);

        /** La même compaction, avec tout ce qui partirait maintenant : ce qui part à chaque demande, et ce qu'il reste. */
        public Compaction withBaseline(int baseline) {
            return new Compaction(summarized, summary, historyTokens, summarized == 0 ? 0 : baseline + historyTokens, contextWindow,
                contextEstimated);
        }
    }
}
