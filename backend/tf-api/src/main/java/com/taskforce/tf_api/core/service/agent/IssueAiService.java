package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.ApproveSpecRequest;
import com.taskforce.tf_api.core.dto.request.CreateChecklistItemRequest;
import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.response.IssueSpecDraft;
import com.taskforce.tf_api.core.dto.response.IssueSpecDraft.SimilarNode;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.core.service.brain.BrainSearchService.ScoredNode;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Génération assistée de <b>spécification + prompt d'exécution</b> pour une issue (le « wow » PFR).
 *
 * <p>Flux <b>human-in-the-loop</b> : {@link #generateSpec} produit un brouillon (RAG « déjà vu » +
 * LLM local) <b>sans rien écrire</b> ; l'humain relit/édite puis {@link #approveSpec} persiste un
 * node {@code SPEC} lié à l'issue dans le Brain OS (le cerveau grandit tout seul). Le
 * {@code executionPrompt} est prêt à coller dans Claude Code.
 *
 * <p>Sans LLM disponible, on ne bloque pas : gabarit déterministe fondé sur l'issue + le RAG.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IssueAiService {

    private final BrainAccessGuard   access;
    private final BrainSearchService search;
    private final KnowledgeService   knowledgeService;
    private final IssueService        issueService;
    private final IssueRepository     issueRepository;
    private final LlmClient          llm;
    private final ObjectMapper       objectMapper;

    @Value("${ai.groq.assistant-model:llama-3.3-70b-versatile}")
    private String model; // ignoré par l'AI Gateway (Ollama impose son modèle) ; utile si provider=groq

    private static final int RAG_TOPK = 5;

    // =========================================================================
    // 1. Génération (aucune écriture — brouillon soumis à l'humain)
    // =========================================================================

    @Transactional
    public IssueSpecDraft generateSpec(String slug, Long projectId, Long issueId, Long userId, boolean deep) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Issue issue = resolveIssue(ws, projectId, issueId);

        String issueText = issueText(issue);
        List<ScoredNode> scored = search.retrieveRelevantScored(ws.getId(), issueText, RAG_TOPK);
        List<KnowledgeNode> hits = scored.stream().map(ScoredNode::node).toList();
        List<SimilarNode> similar = scored.stream()
            .map(s -> new SimilarNode(s.node().getId(), s.node().getTitle(),
                s.node().getDomain() != null ? s.node().getDomain().name() : null, s.score()))
            .toList();

        if (!llm.isConfigured()) {
            return fallbackDraft(issue, similar);
        }
        try {
            // Défaut = tier "fast" (8B, rapide) ; "deep" (14B + thinking) = bouton « Approfondir ».
            JsonNode json = callLlm(issue, hits, deep ? "deep" : "fast");
            String spec = json.path("spec").asText("").trim();
            String prompt = json.path("executionPrompt").asText("").trim();
            List<String> breakdown = readStringArray(json.path("breakdown"));
            if (spec.isEmpty() && prompt.isEmpty()) throw new IllegalStateException("réponse LLM vide");
            return new IssueSpecDraft(spec, prompt, breakdown, similar, "generated");
        } catch (Exception ex) {
            log.warn("Génération spec IA indisponible (issue={}): {}", issueId, ex.getMessage());
            return fallbackDraft(issue, similar);
        }
    }

    // =========================================================================
    // 2. Approbation (human-in-the-loop → write-back Brain OS)
    // =========================================================================

    @Transactional
    public KnowledgeNodeResponse approveSpec(String slug, Long projectId, Long issueId,
                                             Long userId, ApproveSpecRequest req) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Issue issue = resolveIssue(ws, projectId, issueId);
        String ref = identifier(issue);

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("issueId", issueId);
        metadata.put("issueIdentifier", ref);
        metadata.put("generatedBy", "ai");
        if (req.executionPrompt() != null && !req.executionPrompt().isBlank()) {
            metadata.put("executionPrompt", req.executionPrompt());
        }

        CreateKnowledgeNodeRequest node = CreateKnowledgeNodeRequest.builder()
            .type("SPEC")
            .domain("ENGINEERING")
            .title(truncate("Spec — " + ref + " " + issue.getTitle(), 300))
            .content(assembleContent(req))
            .refType("ISSUE")
            .refId(issueId)
            .tags(List.of("spec", "ai-generated"))
            .metadata(metadata)
            .build();

        KnowledgeNodeResponse saved = knowledgeService.createNode(slug, userId, node);

        // Suivi d'avancement : le découpage IA devient la checklist de l'issue.
        if (req.addChecklist() && req.breakdown() != null) {
            for (String step : req.breakdown()) {
                if (step == null || step.isBlank()) continue;
                CreateChecklistItemRequest item = new CreateChecklistItemRequest();
                item.setContent(truncate(step.trim(), 500));
                issueService.addChecklistItem(slug, projectId, issueId, userId, item);
            }
        }
        return saved;
    }

    // =========================================================================
    // Helpers — LLM
    // =========================================================================

    private JsonNode callLlm(Issue issue, List<KnowledgeNode> hits, String tier) throws Exception {
        String content = llm.chatCompletion(model, systemPrompt(hits), userPrompt(issue), true, tier);
        return objectMapper.readTree(content);
    }

    private String systemPrompt(List<KnowledgeNode> hits) {
        StringBuilder sb = new StringBuilder();
        sb.append("Tu es Taskforce AI, un architecte logiciel senior. À partir d'une issue, tu produis ")
          .append("une spécification actionnable et un prompt d'exécution prêt à coller dans Claude Code.\n\n")
          .append("Réponds STRICTEMENT en JSON (aucun texte hors JSON), avec ces clés :\n")
          .append("- \"spec\" (string markdown) : Contexte, Critères d'acceptation (liste cochable), ")
          .append("Approche technique, Risques/points d'attention.\n")
          .append("- \"executionPrompt\" (string) : un prompt autonome et précis pour un agent de code ")
          .append("(Claude Code) : quoi implémenter, fichiers/couches concernés, contraintes du repo, ")
          .append("definition of done, tests attendus. Rédige-le à l'impératif, sans blabla.\n")
          .append("- \"breakdown\" (array de strings) : le découpage en sous-tâches ordonnées.\n\n")
          .append("Fonde-toi sur le contexte réel du projet (Brain OS) ci-dessous ; n'invente pas de ")
          .append("conventions. Réponds dans la langue de l'issue.");
        if (!hits.isEmpty()) {
            sb.append("\n\nContexte projet (Brain OS) :\n");
            for (KnowledgeNode n : hits) {
                String c = n.getContent() != null ? n.getContent() : "";
                if (c.length() > 500) c = c.substring(0, 500) + "…";
                sb.append("- [").append(n.getDomain()).append("] ").append(n.getTitle())
                  .append(" : ").append(c.replace("\n", " ")).append("\n");
            }
        }
        return sb.toString();
    }

    private String userPrompt(Issue issue) {
        StringBuilder sb = new StringBuilder();
        sb.append("Issue ").append(identifier(issue)).append("\n");
        sb.append("Titre : ").append(issue.getTitle()).append("\n");
        if (issue.getType() != null) sb.append("Type : ").append(issue.getType().getName()).append("\n");
        if (issue.getPriority() != null) sb.append("Priorité : ").append(issue.getPriority()).append("\n");
        sb.append("Description :\n")
          .append(issue.getDescription() != null && !issue.getDescription().isBlank()
              ? issue.getDescription() : "(aucune description fournie)");
        return sb.toString();
    }

    // =========================================================================
    // Helpers — repli déterministe (jamais inventé : structure fondée sur l'issue + RAG)
    // =========================================================================

    private IssueSpecDraft fallbackDraft(Issue issue, List<SimilarNode> similar) {
        String ref = identifier(issue);
        String desc = issue.getDescription() != null && !issue.getDescription().isBlank()
            ? issue.getDescription() : "_(aucune description — à compléter)_";

        String spec = "## Contexte\n" + desc + "\n\n"
            + "## Critères d'acceptation\n- [ ] À définir\n\n"
            + "## Approche technique\n_À compléter (LLM local indisponible — brouillon structurel)._\n\n"
            + "## Points d'attention\n- Respecter les conventions du repo (couches `shared ← core ← modules`, `/api`, Flyway).";

        String prompt = "Implémente l'issue " + ref + " : " + issue.getTitle() + ".\n\n"
            + "Description :\n" + desc + "\n\n"
            + "Contraintes : respecte les conventions du dépôt (architecture en couches, préfixe `/api`, "
            + "migrations Flyway, TypeScript strict côté front, tests). Fournis un diff prêt à review et les tests associés.";

        List<String> breakdown = List.of(
            "Analyser la demande et les fichiers concernés",
            "Implémenter le changement",
            "Ajouter les tests",
            "Vérifier build + lint");

        return new IssueSpecDraft(spec, prompt, breakdown, similar, "fallback");
    }

    // =========================================================================
    // Helpers — divers
    // =========================================================================

    private Issue resolveIssue(Workspace ws, Long projectId, Long issueId) {
        Issue issue = issueRepository.findById(issueId)
            .orElseThrow(() -> new ResourceNotFoundException("Issue", "id", issueId));
        if (issue.getProject() == null
            || !issue.getProject().getId().equals(projectId)
            || issue.getProject().getWorkspace() == null
            || !issue.getProject().getWorkspace().getId().equals(ws.getId())) {
            throw new ResourceNotFoundException("Issue", "id", issueId);
        }
        return issue;
    }

    private String issueText(Issue issue) {
        String desc = issue.getDescription() != null ? issue.getDescription() : "";
        return (issue.getTitle() + "\n" + desc).trim();
    }

    private String identifier(Issue issue) {
        return issue.getProject().getIdentifier() + "-" + issue.getSequenceNumber();
    }

    private String assembleContent(ApproveSpecRequest req) {
        StringBuilder sb = new StringBuilder(req.spec() != null ? req.spec() : "");
        if (req.breakdown() != null && !req.breakdown().isEmpty()) {
            sb.append("\n\n## Découpage\n");
            for (String step : req.breakdown()) sb.append("- ").append(step).append("\n");
        }
        if (req.executionPrompt() != null && !req.executionPrompt().isBlank()) {
            sb.append("\n\n## 🤖 Prompt d'exécution (Claude Code)\n```text\n")
              .append(req.executionPrompt().trim()).append("\n```\n");
        }
        return sb.toString();
    }

    private List<String> readStringArray(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            node.forEach(n -> {
                String v = n.asText("").trim();
                if (!v.isEmpty()) out.add(v);
            });
        }
        return out;
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) : s;
    }
}
