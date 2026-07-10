package com.taskforce.tf_api.core.service.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Le plan d'un workflow d'analyse : les étapes affichées en direct dans le dock.
 *
 * <p>Sérialisé au contrat {@code PlanTask} du front (composant {@code AgentPlan}), et stocké tel
 * quel dans {@code analysis_job.plan_json} — rouvrir le dock rejoue donc l'état exact du workflow.
 *
 * <p>Chaque étape correspond à un travail réellement effectué par {@link DecisionService} : on
 * n'affiche pas d'étape décorative. L'étape {@link #CLARIFY} n'existe qu'en mode approfondi,
 * seul mode où le modèle est autorisé à poser une question.
 */
public final class AnalysisPlan {

    public static final String OBSERVE = "observe";
    public static final String CONTEXT = "context";
    public static final String ANALYZE = "analyze";
    public static final String CLARIFY = "clarify";
    public static final String PERSIST = "persist";

    // Statuts du contrat PlanTask côté front.
    public static final String PENDING     = "pending";
    public static final String IN_PROGRESS = "in-progress";
    public static final String COMPLETED   = "completed";
    public static final String NEED_HELP   = "need-help";
    public static final String FAILED      = "failed";

    private final ArrayNode tasks;

    private AnalysisPlan(ArrayNode tasks) {
        this.tasks = tasks;
    }

    /** Plan initial (toutes les étapes en attente). L'étape de clarification n'existe qu'en DEEP. */
    public static AnalysisPlan initial(ObjectMapper mapper, boolean deep) {
        AnalysisPlan plan = new AnalysisPlan(mapper.createArrayNode());

        plan.addTask(OBSERVE, "Observer le projet",
            "Lire les métriques réelles : issues par statut, retards, échéances proches.", null)
            .subtask("Compter les issues par statut", "Total, ouvertes, en cours, terminées.", "metrics")
            .subtask("Repérer les retards", "Issues assignées dépassées ou à échéance sous 7 jours.", "metrics");

        plan.addTask(CONTEXT, "Récupérer le contexte",
            "Recherche sémantique dans le Brain OS : vision, specs, données ingérées.", OBSERVE)
            .subtask("Recherche sémantique", "Les 6 nodes les plus proches du projet.", "brain-search");

        plan.addTask(ANALYZE, "Analyser et décider",
            deep ? "Modèle 14B avec raisonnement — situation, risques, 3 priorités."
                 : "Modèle 8B — situation, risques, 3 priorités.", CONTEXT)
            .subtask("Interroger le modèle", deep ? "Tier « deep »." : "Tier « fast ».", "llm");

        if (deep) {
            plan.addTask(CLARIFY, "Clarifier avec l'humain",
                "Le modèle peut poser une question s'il lui manque un élément décisif.", ANALYZE)
                .subtask("Question de clarification", "Suspend le workflow jusqu'à la réponse.", "hitl");
        }

        plan.addTask(PERSIST, "Enregistrer la décision",
            "Persister le brief et ses priorités, actionnables depuis la page Analytics.",
            deep ? CLARIFY : ANALYZE)
            .subtask("Écrire le brief", "Situation, risques et 3 priorités.", "db");

        return plan;
    }

    /** Relit un plan stocké. Retombe sur un plan vide si le JSON est illisible (jamais bloquant). */
    public static AnalysisPlan parse(ObjectMapper mapper, String json) {
        try {
            JsonNode node = mapper.readTree(json);
            if (node instanceof ArrayNode array) return new AnalysisPlan(array);
        } catch (Exception ignored) {
            // plan corrompu : on repart d'un plan vide plutôt que de faire échouer le workflow
        }
        return new AnalysisPlan(mapper.createArrayNode());
    }

    /**
     * Change le statut d'une étape. Les sous-étapes suivent l'étape parente : le plan reste
     * lisible sans avoir à piloter chaque sous-étape indépendamment.
     */
    public AnalysisPlan status(String taskId, String status) {
        for (JsonNode task : tasks) {
            if (!taskId.equals(task.path("id").asText())) continue;
            ((ObjectNode) task).put("status", status);
            for (JsonNode sub : task.path("subtasks")) {
                ((ObjectNode) sub).put("status", status);
            }
        }
        return this;
    }

    /** Marque en échec la (ou les) étape(s) encore en cours — utilisé quand le workflow casse. */
    public AnalysisPlan failRunning() {
        for (JsonNode task : tasks) {
            if (IN_PROGRESS.equals(task.path("status").asText())) {
                status(task.path("id").asText(), FAILED);
            }
        }
        return this;
    }

    public JsonNode toJsonNode() {
        return tasks;
    }

    public String toJson() {
        return tasks.toString();
    }

    // -------------------------------------------------------------------------

    private TaskBuilder addTask(String id, String title, String description, String dependsOn) {
        ObjectNode task = tasks.addObject();
        task.put("id", id);
        task.put("title", title);
        task.put("description", description);
        task.put("status", PENDING);
        task.put("level", 0);
        ArrayNode deps = task.putArray("dependencies");
        if (dependsOn != null) deps.add(dependsOn);
        task.putArray("subtasks");
        return new TaskBuilder(task);
    }

    /** Petit builder pour attacher les sous-étapes sans alourdir {@link #initial}. */
    private static final class TaskBuilder {
        private final ObjectNode task;
        private int seq = 0;

        private TaskBuilder(ObjectNode task) {
            this.task = task;
        }

        TaskBuilder subtask(String title, String description, String tool) {
            ObjectNode sub = ((ArrayNode) task.get("subtasks")).addObject();
            sub.put("id", task.get("id").asText() + "-" + (++seq));
            sub.put("title", title);
            sub.put("description", description);
            sub.put("status", PENDING);
            sub.putArray("tools").add(tool);
            return this;
        }
    }
}
