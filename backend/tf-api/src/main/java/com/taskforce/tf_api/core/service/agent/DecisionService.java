package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.DecisionBrief;
import com.taskforce.tf_api.core.dto.response.DecisionBrief.Priority;
import com.taskforce.tf_api.core.dto.response.DecisionBrief.Snapshot;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Le raisonnement de la boucle <b>OODA</b> par projet, en briques réutilisables.
 *
 * <p><b>Observe</b> : {@link #snapshot} — métriques réelles du projet. <b>Contexte</b> :
 * {@link #retrieveContext} — Brain OS (vision, specs, données ingérées). <b>Reflect/Predict</b> :
 * {@link #analyze} — le LLM local en tire une situation, des risques et les <b>3 priorités de
 * demain</b>, ou pose une question de clarification. Repli déterministe si le LLM est absent.
 *
 * <p>Ce service ne fait ni autorisation ni persistance : il est orchestré par
 * {@link AnalysisJobRunner}, qui joue ces briques comme les étapes d'un workflow observable.
 * <b>Act</b> : l'humain accepte une priorité, qui devient une issue.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DecisionService {

    private final BrainSearchService search;
    private final IssueRepository    issueRepository;
    private final LlmClient          llm;
    private final ObjectMapper       objectMapper;

    private static final int DUE_SOON_DAYS = 7;
    private static final int RAG_TOPK = 6;

    /**
     * Résultat d'un tour d'analyse : soit un brief, soit une <b>question de clarification</b>
     * quand le modèle estime qu'il lui manque un élément décisif (mode approfondi uniquement).
     * Exactement l'un des deux est renseigné.
     */
    public record Analysis(DecisionBrief brief, String question) {
        public boolean needsInput() {
            return question != null && !question.isBlank();
        }
    }

    /** Contexte Brain OS pertinent pour le projet (RAG). Sans transaction : la recherche appelle le modèle d'embeddings. */
    public List<KnowledgeNode> retrieveContext(Long workspaceId, String projectName) {
        return search.retrieveRelevant(workspaceId,
            projectName + " vision goals roadmap risks priorities", RAG_TOPK);
    }

    /**
     * Un tour d'analyse. Si {@code allowQuestion} et que le modèle demande une clarification,
     * retourne une {@link Analysis} porteuse de la question au lieu d'un brief.
     *
     * <p>Volontairement <b>hors transaction</b> : l'appel au LLM dure de quelques secondes à
     * plusieurs minutes, et garder une connexion à la base ouverte pendant ce temps épuiserait
     * le pool dès que deux analyses tournent ensemble.
     *
     * @param clarification réponse humaine à réinjecter dans le prompt (null au premier tour)
     */
    public Analysis analyze(Project project, Snapshot snap, List<KnowledgeNode> hits,
                            boolean deep, String clarification, boolean allowQuestion) {
        if (!llm.isConfigured()) {
            return new Analysis(fallbackBrief(project, snap), null);
        }
        try {
            // Défaut = tier "fast" (petit modèle) ; "deep" (modèle principal qui raisonne) = bouton « Approfondir ».
            JsonNode json = callLlm(project, snap, hits, deep ? "deep" : "fast", clarification, allowQuestion);

            if (allowQuestion) {
                String question = json.path("question").asText("").trim();
                if (!question.isEmpty()) return new Analysis(null, question);
            }
            String situation = json.path("situation").asText("").trim();
            List<String> risks = readStrings(json.path("risks"));
            List<Priority> priorities = readPriorities(json.path("priorities"));
            if (situation.isEmpty() && priorities.isEmpty()) throw new IllegalStateException("empty model answer");
            return new Analysis(new DecisionBrief(situation, risks, priorities, snap, "generated"), null);
        } catch (Exception ex) {
            log.warn("Décision IA indisponible (projet={}): {}", project.getId(), ex.getMessage());
            return new Analysis(fallbackBrief(project, snap), null);
        }
    }

    // =========================================================================
    // Observe — métriques réelles du projet
    // =========================================================================

    /** Transactionnel : la boucle ci-dessous traverse {@code issue.project} (association paresseuse). */
    @Transactional(readOnly = true)
    public Snapshot snapshot(Long projectId) {
        long total = issueRepository.countByProjectId(projectId);
        long open = issueRepository.countOpenIssues(projectId);
        long inProgress = issueRepository.findByProjectIdAndStatusCategory(projectId, IssueStatusCategory.STARTED).size();
        long completed = issueRepository.findByProjectIdAndStatusCategory(projectId, IssueStatusCategory.COMPLETED).size();

        LocalDate today = LocalDate.now();
        long overdue = 0, dueSoon = 0;
        for (Issue i : issueRepository.findOpenAssignedDueOnOrBefore(today.plusDays(DUE_SOON_DAYS))) {
            if (i.getProject() == null || !i.getProject().getId().equals(projectId) || i.getDueDate() == null) continue;
            if (i.getDueDate().isBefore(today)) overdue++;
            else dueSoon++;
        }
        return new Snapshot(total, open, inProgress, completed, overdue, dueSoon);
    }

    // =========================================================================
    // Reflect — LLM
    // =========================================================================

    private JsonNode callLlm(Project project, Snapshot s, List<KnowledgeNode> hits, String tier,
                             String clarification, boolean allowQuestion) throws Exception {
        String content = llm.chatCompletion(
            systemPrompt(hits, allowQuestion), userPrompt(project, s, clarification), true, tier);
        return objectMapper.readTree(content);
    }

    private String systemPrompt(List<KnowledgeNode> hits, boolean allowQuestion) {
        StringBuilder sb = new StringBuilder();
        sb.append("You are TaskForce AI, the COO of the product. From the real metrics of a project and its ")
          .append("context (Brain OS: vision, specs, ingested data), you produce an actionable decision.\n\n")
          .append("Answer STRICTLY in JSON (no text outside the JSON), with these keys:\n")
          .append("- \"situation\" (short markdown string): where the project stands, grounded in the numbers.\n")
          .append("- \"risks\" (array of strings): concrete risks (delays, workload, scope creep...).\n")
          .append("- \"priorities\" (array of 3 objects): the 3 most important actions for tomorrow, ")
          .append("each object = {\"title\": string (concrete action, imperative), \"rationale\": string ")
          .append("(why now), \"level\": \"HIGH\"|\"MEDIUM\"|\"LOW\"}.\n\n");
        if (allowQuestion) {
            // Une seule question, et seulement si elle change la décision : sinon le workflow
            // s'arrête pour rien et l'humain paie une interruption sans valeur.
            sb.append("EXCEPTION: if, and only if, a missing piece of context prevents you from choosing ")
              .append("between radically different priorities, answer instead with the SINGLE key \"question\" ")
              .append("(string): a short, closed question for the person who runs the project. Do not ask ")
              .append("anything the metrics or the context already answer. When in doubt, decide without asking.\n\n");
        }
        sb.append("Be concrete and prioritize impact. Do not invent data missing from the context. Language: English.");
        if (!hits.isEmpty()) {
            sb.append("\n\nProject context (Brain OS):\n");
            for (KnowledgeNode n : hits) {
                String c = n.getContent() != null ? n.getContent() : "";
                if (c.length() > 400) c = c.substring(0, 400) + "…";
                sb.append("- [").append(n.getDomain()).append("] ").append(n.getTitle())
                  .append(": ").append(c.replace("\n", " ")).append("\n");
            }
        }
        return sb.toString();
    }

    private String userPrompt(Project project, Snapshot s, String clarification) {
        StringBuilder sb = new StringBuilder();
        sb.append("Project: ").append(project.getName()).append("\n")
          .append("Metrics (today):\n")
          .append("- total issues: ").append(s.total()).append("\n")
          .append("- open: ").append(s.open()).append(" (in progress: ").append(s.inProgress()).append(")\n")
          .append("- done: ").append(s.completed()).append("\n")
          .append("- overdue (assigned): ").append(s.overdue()).append("\n")
          .append("- due within ").append(DUE_SOON_DAYS).append(" days: ").append(s.dueSoon()).append("\n");
        if (clarification != null && !clarification.isBlank()) {
            sb.append("\nClarification from the person who runs the project: ")
              .append(clarification.trim())
              .append("\nTake it into account and decide now (do not ask another question).\n");
        }
        sb.append("Give the situation, the risks, and the 3 priorities for tomorrow.");
        return sb.toString();
    }

    // =========================================================================
    // Repli déterministe (fondé sur les métriques, jamais inventé)
    // =========================================================================

    public DecisionBrief fallbackBrief(Project project, Snapshot s) {
        double progress = s.total() > 0 ? (100.0 * s.completed() / s.total()) : 0;
        String situation = String.format(java.util.Locale.ROOT,
            "**%s**: %d issues (%d open, %d in progress, %d done, %.0f%% complete).%s",
            project.getName(), s.total(), s.open(), s.inProgress(), s.completed(), progress,
            s.overdue() > 0 ? " " + s.overdue() + " overdue." : "");

        List<String> risks = new ArrayList<>();
        if (s.overdue() > 0) risks.add(s.overdue() + " overdue issue(s): the schedule may slip.");
        if (s.dueSoon() > 0) risks.add(s.dueSoon() + " issue(s) due within " + DUE_SOON_DAYS + " days.");
        if (s.inProgress() > 5) risks.add("Many issues in parallel (" + s.inProgress() + "): high work in progress.");
        if (risks.isEmpty()) risks.add("No strong risk signal in the metrics.");

        List<Priority> priorities = new ArrayList<>();
        if (s.overdue() > 0)
            priorities.add(new Priority("Handle the " + s.overdue() + " overdue issues", "Unblock the schedule before starting new work.", "HIGH"));
        if (s.dueSoon() > 0)
            priorities.add(new Priority("Secure this week's deadlines", s.dueSoon() + " issue(s) are due within " + DUE_SOON_DAYS + " days.", "MEDIUM"));
        priorities.add(new Priority("Review the backlog priorities", "Align the next issues with the vision (the detailed analysis needs AI).", "LOW"));

        return new DecisionBrief(situation, risks, priorities.subList(0, Math.min(3, priorities.size())), s, "fallback");
    }

    // =========================================================================
    // Parsing JSON défensif
    // =========================================================================

    private List<String> readStrings(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node != null && node.isArray()) node.forEach(n -> {
            String v = n.asText("").trim();
            if (!v.isEmpty()) out.add(v);
        });
        return out;
    }

    private List<Priority> readPriorities(JsonNode node) {
        List<Priority> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode n : node) {
                String title = n.path("title").asText("").trim();
                if (title.isEmpty()) continue;
                String rationale = n.path("rationale").asText("").trim();
                String level = n.path("level").asText("MEDIUM").trim().toUpperCase();
                if (!level.equals("HIGH") && !level.equals("MEDIUM") && !level.equals("LOW")) level = "MEDIUM";
                out.add(new Priority(title, rationale, level));
                if (out.size() == 3) break;
            }
        }
        return out;
    }
}
