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
 *
 * <p>{@code model} : le modèle qui a répondu, tel que la passerelle l'a appelé ; null quand aucun modèle n'a répondu (un
 * repli). Le pied de la réponse le montre (test du CEO du 05/11/2026 : « jsp avec quel model il a fait ca »).
 */
public record AssistantAnswer(
    String answer,
    String reasoning,
    String mode,
    List<AssistantSource> sources,
    List<AssistantStep> steps,
    List<AssistantToolCall> toolCalls,
    AssistantUsage usage,
    String record,
    String model
) {
    /** Une réponse sans dossier à elle. */
    public AssistantAnswer(String answer, String reasoning, String mode, List<AssistantSource> sources,
                           List<AssistantStep> steps, List<AssistantToolCall> toolCalls, AssistantUsage usage) {
        this(answer, reasoning, mode, sources, steps, toolCalls, usage, null, null);
    }

    /** Une réponse dont le modèle n'est pas connu. */
    public AssistantAnswer(String answer, String reasoning, String mode, List<AssistantSource> sources,
                           List<AssistantStep> steps, List<AssistantToolCall> toolCalls, AssistantUsage usage,
                           String record) {
        this(answer, reasoning, mode, sources, steps, toolCalls, usage, record, null);
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

    /**
     * Tokens réellement consommés par ce tour (cumulés sur les appels LLM), et ce que le modèle a lu au dernier appel :
     * {@code lastPromptTokens}, la taille de ce prompt (0 sans appel), et {@code contextWindow}, la fenêtre de contexte
     * que la passerelle lui a donnée (Ollama), null quand le fournisseur la tient lui-même. La jauge de contexte de la
     * conversation compare ces deux-là, pas le cumul.
     */
    public record AssistantUsage(long promptTokens, long completionTokens, long totalTokens, long lastPromptTokens,
                                 Integer contextWindow) {
        public static final AssistantUsage NONE = new AssistantUsage(0, 0, 0);

        /** Un usage sans ce qu'a lu le dernier appel. */
        public AssistantUsage(long promptTokens, long completionTokens, long totalTokens) {
            this(promptTokens, completionTokens, totalTokens, 0, null);
        }
    }
}
