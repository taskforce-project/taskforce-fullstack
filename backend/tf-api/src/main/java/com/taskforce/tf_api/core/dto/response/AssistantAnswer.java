package com.taskforce.tf_api.core.dto.response;

import java.util.List;
import java.util.Map;

/**
 * Réponse structurée de l'assistant agentique. Pensée pour un rendu riche (kit chat) :
 * étapes du raisonnement, outils appelés, sources Brain OS citées, plus la réponse markdown.
 *
 * <p>{@code mode} : "fast" (Q&A simple), "deep" (raisonnement + outils), "fallback" (sans LLM —
 * on expose quand même le RAG : sources réelles + réponse de repli).
 */
public record AssistantAnswer(
    String answer,
    String reasoning,
    String mode,
    List<AssistantSource> sources,
    List<AssistantStep> steps,
    List<AssistantToolCall> toolCalls,
    AssistantUsage usage
) {
    /** Une note Brain OS utilisée pour fonder la réponse (RAG). */
    public record AssistantSource(String title, String domain, Double score) {}

    /**
     * Une étape du déroulé de l'agent. status : pending | active | done | error.
     * {@code description} = détail optionnel (routing, domaines trouvés, outils appelés…).
     */
    public record AssistantStep(String label, String status, String description) {
        /** Compat : étape sans détail. */
        public AssistantStep(String label, String status) { this(label, status, null); }
    }

    /**
     * Un appel d'outil de l'agent. status : success | error | pending (proposé, il attend l'accord de la personne) |
     * refused (les règles de l'espace le refusent) | question (la carte attend une réponse de la personne, que Cortex lui
     * demande : rien n'est préparé). {@code record} : le dossier de la réponse, que l'accord prolonge. {@code ref} :
     * l'empreinte du résultat de cet appel au dossier, que « Undo » nomme pour défaire celui-là (R77). {@code target} :
     * l'issue que touche un geste du MCP TaskForce ({@code issueId}, {@code projectId}, {@code key}, {@code title}, et
     * {@code runId} de sa mission), dont la conversation montre les cartes (ADR-024). {@code question} : ce que TaskForce
     * demande à la personne avant le geste (R115), avec un statut question ; la carte montre ses choix, et
     * {@code ref} nomme alors la question à laquelle la réponse se rattache.
     */
    public record AssistantToolCall(String name, String status, String input, String output, String record, String ref,
                                    Map<String, Object> target, AssistantQuestion question) {
        /** Un appel sans question de TaskForce. */
        public AssistantToolCall(String name, String status, String input, String output, String record, String ref,
                                 Map<String, Object> target) {
            this(name, status, input, output, record, ref, target, null);
        }

        /** Un appel sans empreinte ni issue : une proposition, ou une réponse d'avant les gestes. */
        public AssistantToolCall(String name, String status, String input, String output, String record) {
            this(name, status, input, output, record, null, null, null);
        }
    }

    /**
     * Une question de TaskForce avant un geste (R115) : l'argument que la réponse remplit, la question, et ses choix, le
     * défaut d'abord ({@code recommended}) quand il y en a un. Une réponse libre est toujours possible.
     */
    public record AssistantQuestion(String field, String text, List<AssistantChoice> choices) {}

    /** Un choix d'une question : la valeur que reçoit le geste, ce que la carte en montre, s'il est le défaut. */
    public record AssistantChoice(String value, String label, boolean recommended) {}

    /** Tokens réellement consommés par ce tour (cumulés sur les appels LLM). */
    public record AssistantUsage(long promptTokens, long completionTokens, long totalTokens) {
        public static final AssistantUsage NONE = new AssistantUsage(0, 0, 0);
    }
}
