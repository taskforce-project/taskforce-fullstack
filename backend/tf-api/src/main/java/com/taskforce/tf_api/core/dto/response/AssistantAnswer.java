package com.taskforce.tf_api.core.dto.response;

import java.util.List;
import java.util.Map;

/**
 * Réponse structurée de l'assistant agentique. Pensée pour un rendu riche (kit chat) :
 * étapes du raisonnement, outils appelés, sources Brain OS citées, plus la réponse markdown.
 *
 * <p>{@code mode} : "fast" (Q&A simple), "deep" (raisonnement + outils), "fallback" (sans LLM —
 * on expose quand même le RAG : sources réelles + réponse de repli).
 *
 * <p>{@code record} : le dossier de la réponse, quand elle en a un : celui de ses appels d'outil, ou celui qui s'ouvre
 * quand TaskForce corrige une réponse sans outil (R116). Il fait d'elle un cas de la banque.
 */
public record AssistantAnswer(
    String answer,
    String reasoning,
    String mode,
    List<AssistantSource> sources,
    List<AssistantStep> steps,
    List<AssistantToolCall> toolCalls,
    AssistantUsage usage,
    String record
) {
    /** Une réponse sans dossier à elle. */
    public AssistantAnswer(String answer, String reasoning, String mode, List<AssistantSource> sources,
                           List<AssistantStep> steps, List<AssistantToolCall> toolCalls, AssistantUsage usage) {
        this(answer, reasoning, mode, sources, steps, toolCalls, usage, null);
    }

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
     * {@code runId} de sa mission), dont la conversation montre les cartes (ADR-024). {@code questions} : ce que
     * TaskForce demande à la personne avant le geste (R115), deux questions au plus dans la même carte, avec un statut
     * question ; la carte montre leurs choix, et {@code ref} nomme alors la carte à laquelle les réponses se rattachent.
     */
    public record AssistantToolCall(String name, String status, String input, String output, String record, String ref,
                                    Map<String, Object> target, List<AssistantQuestion> questions) {
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
     * Une question de TaskForce avant un geste (R115), dans la forme des questions de Claude : l'argument que la réponse
     * remplit, son titre court, la question, si plusieurs choix se cochent ({@code multiple}), et ses choix, quatre au
     * plus, le recommandé d'abord. Une réponse libre (« Other ») est toujours possible.
     */
    public record AssistantQuestion(String field, String header, String text, boolean multiple,
                                    List<AssistantChoice> choices) {}

    /**
     * Un choix d'une question : la valeur que reçoit le geste, ce que la carte en montre, ce qu'il veut dire en une ligne
     * (null quand le libellé suffit), s'il est recommandé.
     */
    public record AssistantChoice(String value, String label, String description, boolean recommended) {}

    /** Tokens réellement consommés par ce tour (cumulés sur les appels LLM). */
    public record AssistantUsage(long promptTokens, long completionTokens, long totalTokens) {
        public static final AssistantUsage NONE = new AssistantUsage(0, 0, 0);
    }
}
