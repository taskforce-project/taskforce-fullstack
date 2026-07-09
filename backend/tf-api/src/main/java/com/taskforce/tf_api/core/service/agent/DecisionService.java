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
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Aide à la décision par projet — la première surface de la boucle <b>OODA</b> (Phase C).
 *
 * <p><b>Observe</b> : métriques réelles du projet ({@link Snapshot}) + contexte Brain OS (vision,
 * specs, données ingérées via les connecteurs). <b>Reflect/Predict</b> : le LLM local en tire une
 * situation, des risques et les <b>3 priorités de demain</b>. <b>Act</b> : l'humain transforme une
 * priorité en issue (côté front, via l'endpoint issues existant). Repli déterministe si LLM absent.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DecisionService {

    private final BrainAccessGuard   access;
    private final BrainSearchService search;
    private final IssueRepository     issueRepository;
    private final ProjectRepository   projectRepository;
    private final LlmClient          llm;
    private final ObjectMapper       objectMapper;

    @Value("${ai.groq.assistant-model:llama-3.3-70b-versatile}")
    private String model;

    private static final int DUE_SOON_DAYS = 7;
    private static final int RAG_TOPK = 6;

    @Transactional
    public DecisionBrief decide(String slug, Long projectId, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Project project = projectRepository.findByIdAndWorkspaceId(projectId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Project", "id", projectId));

        Snapshot snap = snapshot(projectId);
        List<KnowledgeNode> hits = search.retrieveRelevant(ws.getId(),
            project.getName() + " vision objectifs roadmap risques priorités", RAG_TOPK);

        if (!llm.isConfigured()) {
            return fallbackBrief(project, snap);
        }
        try {
            JsonNode json = callLlm(project, snap, hits);
            String situation = json.path("situation").asText("").trim();
            List<String> risks = readStrings(json.path("risks"));
            List<Priority> priorities = readPriorities(json.path("priorities"));
            if (situation.isEmpty() && priorities.isEmpty()) throw new IllegalStateException("réponse LLM vide");
            return new DecisionBrief(situation, risks, priorities, snap, "generated");
        } catch (Exception ex) {
            log.warn("Décision IA indisponible (projet={}): {}", projectId, ex.getMessage());
            return fallbackBrief(project, snap);
        }
    }

    // =========================================================================
    // Observe — métriques réelles du projet
    // =========================================================================

    private Snapshot snapshot(Long projectId) {
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

    private JsonNode callLlm(Project project, Snapshot s, List<KnowledgeNode> hits) throws Exception {
        String content = llm.chatCompletion(model, systemPrompt(hits), userPrompt(project, s), true);
        return objectMapper.readTree(content);
    }

    private String systemPrompt(List<KnowledgeNode> hits) {
        StringBuilder sb = new StringBuilder();
        sb.append("Tu es Taskforce AI, le COO du produit. À partir des métriques réelles d'un projet et du ")
          .append("contexte (Brain OS : vision, specs, données ingérées), tu produis une décision actionnable.\n\n")
          .append("Réponds STRICTEMENT en JSON (aucun texte hors JSON), avec ces clés :\n")
          .append("- \"situation\" (string markdown court) : où en est le projet, fondé sur les chiffres.\n")
          .append("- \"risks\" (array de strings) : risques concrets (retards, charge, dérive de scope…).\n")
          .append("- \"priorities\" (array de 3 objets) : les 3 actions les plus importantes pour demain, ")
          .append("chaque objet = {\"title\": string (action concrète, à l'impératif), \"rationale\": string ")
          .append("(pourquoi maintenant), \"level\": \"HIGH\"|\"MEDIUM\"|\"LOW\"}.\n\n")
          .append("Sois concret et priorise l'impact. N'invente pas de données absentes du contexte. Langue : français.");
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

    private String userPrompt(Project project, Snapshot s) {
        return "Projet : " + project.getName() + "\n"
            + "Métriques (aujourd'hui) :\n"
            + "- issues totales : " + s.total() + "\n"
            + "- ouvertes : " + s.open() + " (dont en cours : " + s.inProgress() + ")\n"
            + "- terminées : " + s.completed() + "\n"
            + "- en retard (assignées) : " + s.overdue() + "\n"
            + "- à échéance sous " + DUE_SOON_DAYS + " j : " + s.dueSoon() + "\n"
            + "Donne la situation, les risques, et les 3 priorités de demain.";
    }

    // =========================================================================
    // Repli déterministe (fondé sur les métriques, jamais inventé)
    // =========================================================================

    private DecisionBrief fallbackBrief(Project project, Snapshot s) {
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
