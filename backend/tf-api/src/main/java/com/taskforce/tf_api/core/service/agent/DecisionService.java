package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
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

    @Value("${ai.model.assistant:gateway-default}")
    private String model;

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

    /** Contexte Brain OS pertinent pour le projet (RAG). */
    @Transactional(readOnly = true)
    public List<KnowledgeNode> retrieveContext(Long workspaceId, String projectName) {
        return search.retrieveRelevant(workspaceId,
            projectName + " vision objectifs roadmap risques priorités", RAG_TOPK);
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
            // Défaut = tier "fast" (8B) ; "deep" (14B + thinking) = bouton « Approfondir ».
            JsonNode json = callLlm(project, snap, hits, deep ? "deep" : "fast", clarification, allowQuestion);

            if (allowQuestion) {
                String question = json.path("question").asText("").trim();
                if (!question.isEmpty()) return new Analysis(null, question);
            }
            String situation = json.path("situation").asText("").trim();
            List<String> risks = readStrings(json.path("risks"));
            List<Priority> priorities = readPriorities(json.path("priorities"));
            if (situation.isEmpty() && priorities.isEmpty()) throw new IllegalStateException("réponse LLM vide");
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
            model, systemPrompt(hits, allowQuestion), userPrompt(project, s, clarification), true, tier);
        return objectMapper.readTree(content);
    }

    private String systemPrompt(List<KnowledgeNode> hits, boolean allowQuestion) {
        StringBuilder sb = new StringBuilder();
        sb.append("Tu es Taskforce AI, le COO du produit. À partir des métriques réelles d'un projet et du ")
          .append("contexte (Brain OS : vision, specs, données ingérées), tu produis une décision actionnable.\n\n")
          .append("Réponds STRICTEMENT en JSON (aucun texte hors JSON), avec ces clés :\n")
          .append("- \"situation\" (string markdown court) : où en est le projet, fondé sur les chiffres.\n")
          .append("- \"risks\" (array de strings) : risques concrets (retards, charge, dérive de scope…).\n")
          .append("- \"priorities\" (array de 3 objets) : les 3 actions les plus importantes pour demain, ")
          .append("chaque objet = {\"title\": string (action concrète, à l'impératif), \"rationale\": string ")
          .append("(pourquoi maintenant), \"level\": \"HIGH\"|\"MEDIUM\"|\"LOW\"}.\n\n");
        if (allowQuestion) {
            // Une seule question, et seulement si elle change la décision : sinon le workflow
            // s'arrête pour rien et l'humain paie une interruption sans valeur.
            sb.append("EXCEPTION — si, et seulement si, un élément de contexte manquant t'empêche de ")
              .append("trancher entre plusieurs priorités radicalement différentes, réponds à la place ")
              .append("avec la SEULE clé \"question\" (string) : une question courte, fermée, adressée à ")
              .append("l'humain qui pilote le projet. Ne pose pas de question dont la réponse est déjà ")
              .append("dans les métriques ou le contexte. Dans le doute, décide sans poser de question.\n\n");
        }
        sb.append("Sois concret et priorise l'impact. N'invente pas de données absentes du contexte. Langue : français.");
        if (!hits.isEmpty()) {
            sb.append("\n\nContexte projet (Brain OS) :\n");
            for (KnowledgeNode n : hits) {
                String c = n.getContent() != null ? n.getContent() : "";
                if (c.length() > 400) c = c.substring(0, 400) + "…";
                sb.append("- [").append(n.getDomain()).append("] ").append(n.getTitle())
                  .append(" : ").append(c.replace("\n", " ")).append("\n");
            }
        }
        return sb.toString();
    }

    private String userPrompt(Project project, Snapshot s, String clarification) {
        StringBuilder sb = new StringBuilder();
        sb.append("Projet : ").append(project.getName()).append("\n")
          .append("Métriques (aujourd'hui) :\n")
          .append("- issues totales : ").append(s.total()).append("\n")
          .append("- ouvertes : ").append(s.open()).append(" (dont en cours : ").append(s.inProgress()).append(")\n")
          .append("- terminées : ").append(s.completed()).append("\n")
          .append("- en retard (assignées) : ").append(s.overdue()).append("\n")
          .append("- à échéance sous ").append(DUE_SOON_DAYS).append(" j : ").append(s.dueSoon()).append("\n");
        if (clarification != null && !clarification.isBlank()) {
            sb.append("\nPrécision apportée par l'humain qui pilote le projet : ")
              .append(clarification.trim())
              .append("\nTiens-en compte et décide maintenant (ne pose plus de question).\n");
        }
        sb.append("Donne la situation, les risques, et les 3 priorités de demain.");
        return sb.toString();
    }

    // =========================================================================
    // Repli déterministe (fondé sur les métriques, jamais inventé)
    // =========================================================================

    public DecisionBrief fallbackBrief(Project project, Snapshot s) {
        double progress = s.total() > 0 ? (100.0 * s.completed() / s.total()) : 0;
        String situation = String.format(
            "**%s** : %d issues (%d ouvertes, %d en cours, %d terminées — %.0f%% d'avancement).%s",
            project.getName(), s.total(), s.open(), s.inProgress(), s.completed(), progress,
            s.overdue() > 0 ? " ⚠️ " + s.overdue() + " en retard." : "");

        List<String> risks = new ArrayList<>();
        if (s.overdue() > 0) risks.add(s.overdue() + " issue(s) en retard — risque de dérive du planning.");
        if (s.dueSoon() > 0) risks.add(s.dueSoon() + " issue(s) à échéance sous " + DUE_SOON_DAYS + " jours.");
        if (s.inProgress() > 5) risks.add("Beaucoup d'issues en parallèle (" + s.inProgress() + ") — WIP élevé.");
        if (risks.isEmpty()) risks.add("Pas de signal de risque fort dans les métriques.");

        List<Priority> priorities = new ArrayList<>();
        if (s.overdue() > 0)
            priorities.add(new Priority("Traiter les " + s.overdue() + " issues en retard", "Débloquer le planning avant d'ouvrir de nouveaux chantiers.", "HIGH"));
        if (s.dueSoon() > 0)
            priorities.add(new Priority("Sécuriser les échéances de la semaine", s.dueSoon() + " issue(s) arrivent à terme sous " + DUE_SOON_DAYS + " j.", "MEDIUM"));
        priorities.add(new Priority("Revue de priorisation du backlog", "Aligner les prochaines issues sur la vision (LLM local requis pour l'analyse fine).", "LOW"));

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
