package com.taskforce.tf_api.core.dto.response;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnore;

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
 *
 * <p>{@code read} : ce que TaskForce a donné à lire à ce modèle, compté (R123, séance n°18 : la ligne grise, « qwen3:8b ·
 * read OPS-35 and 3 comments ») ; null quand aucun modèle n'a répondu.
 *
 * <p>{@code offer} : ce que TaskForce propose quand une demande est trop grande pour ce modèle (TF-J1-13) : un modèle
 * servi dont la fenêtre la tient ; le contrôleur le rend avec le tour, jamais dans la réponse elle-même.
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
    String model,
    AssistantRead read,
    @JsonIgnore ChatTurnResponse.Escalation offer
) {
    /** Une réponse sans proposition d'un autre modèle. */
    public AssistantAnswer(String answer, String reasoning, String mode, List<AssistantSource> sources,
                           List<AssistantStep> steps, List<AssistantToolCall> toolCalls, AssistantUsage usage,
                           String record, String model, AssistantRead read) {
        this(answer, reasoning, mode, sources, steps, toolCalls, usage, record, model, read, null);
    }

    /** Une réponse sans ce que le modèle a lu : un repli, ou une réponse d'avant la ligne grise. */
    public AssistantAnswer(String answer, String reasoning, String mode, List<AssistantSource> sources,
                           List<AssistantStep> steps, List<AssistantToolCall> toolCalls, AssistantUsage usage,
                           String record, String model) {
        this(answer, reasoning, mode, sources, steps, toolCalls, usage, record, model, null, null);
    }

    /** Une réponse sans dossier à elle. */
    public AssistantAnswer(String answer, String reasoning, String mode, List<AssistantSource> sources,
                           List<AssistantStep> steps, List<AssistantToolCall> toolCalls, AssistantUsage usage) {
        this(answer, reasoning, mode, sources, steps, toolCalls, usage, null, null, null, null);
    }

    /** Une réponse dont le modèle n'est pas connu. */
    public AssistantAnswer(String answer, String reasoning, String mode, List<AssistantSource> sources,
                           List<AssistantStep> steps, List<AssistantToolCall> toolCalls, AssistantUsage usage,
                           String record) {
        this(answer, reasoning, mode, sources, steps, toolCalls, usage, record, null, null, null);
    }

    /** La même réponse, avec ce que TaskForce a donné à lire au modèle. */
    public AssistantAnswer withRead(AssistantRead read) {
        return new AssistantAnswer(answer, reasoning, mode, sources, steps, toolCalls, usage, record, model, read, offer);
    }

    /**
     * Ce que TaskForce a donné à lire au modèle pour une réponse (R123) : compté au moment où il le lui donne, jamais
     * deviné après coup. {@code issues} : les issues lues en entier (avant un résumé, ou jointes par la personne), avec le
     * nombre de commentaires donnés ; {@code boards} : les tableaux montrés (celui de l'écran, ceux joints), avec le nombre
     * d'issues montrées et l'issue ouverte ; {@code tools} : les outils qui lisent et ont abouti, avec leur nombre
     * d'appels ; {@code notes} : les notes du Brain OS servies au modèle ; {@code context} : ce que TaskForce a fait pour
     * que la requête tienne la fenêtre de ce modèle (TF-J1-13), null quand rien n'a été touché ; {@code files} : les
     * fichiers joints à la demande (R134).
     */
    public record AssistantRead(List<IssueRead> issues, List<BoardRead> boards, List<ToolRead> tools, int notes,
                                ContextRead context, List<FileRead> files) {
        public AssistantRead {
            issues = issues == null ? List.of() : List.copyOf(issues);
            boards = boards == null ? List.of() : List.copyOf(boards);
            tools = tools == null ? List.of() : List.copyOf(tools);
            files = files == null ? List.of() : List.copyOf(files);
        }

        /** Ce qui a été lu, sans fichier joint. */
        public AssistantRead(List<IssueRead> issues, List<BoardRead> boards, List<ToolRead> tools, int notes, ContextRead context) {
            this(issues, boards, tools, notes, context, List.of());
        }

        /** Ce qui a été lu, rien n'a dû être condensé ni coupé. */
        public AssistantRead(List<IssueRead> issues, List<BoardRead> boards, List<ToolRead> tools, int notes) {
            this(issues, boards, tools, notes, null, List.of());
        }

        /** Un fichier joint à la demande : son nom. */
        public record FileRead(String name) {}

        /**
         * Ce qui a dû changer pour tenir la fenêtre du modèle : les messages condensés dans le résumé pour ce tour, ceux qui
         * n'ont pas pu partir, les résultats d'outils raccourcis pendant la boucle. Jamais en silence (la ligne grise).
         */
        public record ContextRead(int summarized, int leftOut, int toolResults) {}

        /** Une issue lue : sa clé, et les commentaires donnés avec elle. */
        public record IssueRead(String key, int comments) {}

        /** Un tableau montré : la clé du projet, les issues montrées, et l'issue ouverte à l'écran (null sans elle). */
        public record BoardRead(String project, int issues, String open) {}

        /** Un outil qui lit : son nom, et ses appels qui ont abouti. */
        public record ToolRead(String name, int calls) {}
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
     * {@code lastPromptTokens}, la taille de ce prompt (0 sans appel), et {@code contextWindow}, sa fenêtre de contexte :
     * celle que la passerelle a donnée (Ollama), celle que le fournisseur dit de ce modèle, ou la valeur prudente des
     * réglages, dite comme telle par {@code contextEstimated}. La jauge de contexte de la conversation compare ces deux-là,
     * pas le cumul.
     */
    public record AssistantUsage(long promptTokens, long completionTokens, long totalTokens, long lastPromptTokens,
                                 Integer contextWindow, boolean contextEstimated) {
        public static final AssistantUsage NONE = new AssistantUsage(0, 0, 0);

        /** Un usage sans ce qu'a lu le dernier appel. */
        public AssistantUsage(long promptTokens, long completionTokens, long totalTokens) {
            this(promptTokens, completionTokens, totalTokens, 0, null, false);
        }

        /** Un usage dont la fenêtre est connue. */
        public AssistantUsage(long promptTokens, long completionTokens, long totalTokens, long lastPromptTokens,
                              Integer contextWindow) {
            this(promptTokens, completionTokens, totalTokens, lastPromptTokens, contextWindow, false);
        }
    }
}
