package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.ApproveSpecRequest;
import com.taskforce.tf_api.core.dto.request.CreateChecklistItemRequest;
import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.dto.response.IssueSpecDraft;
import com.taskforce.tf_api.core.dto.response.IssueSpecDraft.SimilarNode;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.dto.response.SmartAssignResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueType;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.ProjectLabel;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueTypeRepository;
import com.taskforce.tf_api.core.repository.ProjectLabelRepository;
import com.taskforce.tf_api.core.service.AiMeter;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.SmartAssignService;
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
 *
 * <p><b>Aucune transaction n'englobe un appel au modèle</b> : la lecture de l'issue se fait dans une transaction
 * courte, avant ; l'assignation automatique (qui appelle le modèle) se fait après le commit de l'approbation.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IssueAiService {

    private final BrainAccessGuard   access;
    private final BrainSearchService search;
    private final KnowledgeService   knowledgeService;
    private final IssueService        issueService;
    private final SmartAssignService  smartAssignService;
    private final IssueRepository     issueRepository;
    private final ProjectLabelRepository projectLabelRepository;
    private final IssueTypeRepository issueTypeRepository;
    private final LlmClient          llm;
    private final ObjectMapper       objectMapper;
    private final AiMeter            aiMeter; // gate quota + comptage de la conso tokens de la génération de spec
    private final TransactionTemplate transactionTemplate;

    private static final int RAG_TOPK = 5;

    // =========================================================================
    // 1. Génération (aucune écriture — brouillon soumis à l'humain)
    // =========================================================================

    /** Ce que le modèle doit savoir de l'issue, lu en base avant l'appel (aucune entité gardée ouverte). */
    private record IssueFacts(String identifier, String title, String description, String typeName,
                              String priority, List<String> projectLabels, List<String> projectTypes) {
        String text() {
            return (title + "\n" + (description != null ? description : "")).trim();
        }
    }

    public IssueSpecDraft generateSpec(String slug, Long projectId, Long issueId, Long userId, boolean deep) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        IssueFacts facts = transactionTemplate.execute(status -> {
            Issue issue = resolveIssue(ws, projectId, issueId);
            return new IssueFacts(identifier(issue), issue.getTitle(), issue.getDescription(),
                issue.getType() != null ? issue.getType().getName() : null,
                issue.getPriority() != null ? issue.getPriority().name() : null,
                projectLabelRepository.findByProjectIdOrderByNameAsc(projectId).stream().map(ProjectLabel::getName).toList(),
                issueTypeRepository.findByProjectIdOrderByName(projectId).stream().map(IssueType::getName).toList());
        });

        List<ScoredNode> scored = search.retrieveRelevantScored(ws.getId(), facts.text(), RAG_TOPK);
        List<KnowledgeNode> hits = scored.stream().map(ScoredNode::node).toList();
        List<SimilarNode> similar = scored.stream()
            .map(s -> new SimilarNode(s.node().getId(), s.node().getTitle(),
                s.node().getDomain() != null ? s.node().getDomain().name() : null, s.score()))
            .toList();

        if (!llm.isConfigured()) {
            return fallbackDraft(facts, similar);
        }
        try {
            // Défaut = tier "fast" (rapide) ; "deep" (modèle principal qui raisonne) = bouton « Approfondir ».
            // Métré : gate quota (au-dessus du plafond → repli déterministe, aucun token brûlé) + comptage réel.
            String tier = deep ? "deep" : "fast";
            JsonNode json = aiMeter.metered(ws.getId(), () -> callLlm(facts, hits, tier));
            String spec = json.path("spec").asText("").trim();
            String prompt = json.path("executionPrompt").asText("").trim();
            List<String> breakdown = readStringArray(json.path("breakdown"));
            if (spec.isEmpty() && prompt.isEmpty()) throw new IllegalStateException("empty model answer");
            // Enrichissement de l'issue (labels + type restreints à ceux du projet).
            List<String> labels = readStringArray(json.path("labels")).stream()
                .filter(l -> facts.projectLabels().stream().anyMatch(pl -> pl.equalsIgnoreCase(l)))
                .toList();
            Integer storyPoints = json.path("storyPoints").isNumber() ? json.path("storyPoints").asInt() : null;
            String priority = normalizePriority(json.path("priority").asText(null));
            String type = matchName(json.path("type").asText(null), facts.projectTypes());
            return new IssueSpecDraft(spec, prompt, breakdown, similar, "generated", labels, storyPoints, priority, type);
        } catch (Exception ex) {
            log.warn("Génération spec IA indisponible (issue={}): {}", issueId, ex.getMessage());
            return fallbackDraft(facts, similar);
        }
    }

    // =========================================================================
    // 2. Approbation (human-in-the-loop → write-back Brain OS)
    // =========================================================================

    public KnowledgeNodeResponse approveSpec(String slug, Long projectId, Long issueId,
                                             Long userId, ApproveSpecRequest req) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        KnowledgeNodeResponse saved = transactionTemplate.execute(status -> {
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
                .title(truncate("Spec " + ref + ": " + issue.getTitle(), 300))
                .content(assembleContent(req))
                .refType("ISSUE")
                .refId(issueId)
                .tags(List.of("spec", "ai-generated"))
                .metadata(metadata)
                .build();

            KnowledgeNodeResponse created = knowledgeService.createNode(slug, userId, node);

            // ── Persistance SUR l'issue (l'IA a écrit le ticket, l'humain valide) ──
            if (req.applyToIssue()) {
                applyToIssue(slug, projectId, issueId, userId, req);
            }

            // Suivi d'avancement : le découpage IA devient la checklist de l'issue.
            if (req.addChecklist() && req.breakdown() != null) {
                for (String step : req.breakdown()) {
                    if (step == null || step.isBlank()) continue;
                    CreateChecklistItemRequest item = new CreateChecklistItemRequest();
                    item.setContent(truncate(step.trim(), 500));
                    issueService.addChecklistItem(slug, projectId, issueId, userId, item);
                }
            }
            return created;
        });

        // Assignation intelligente sur l'issue enrichie, après le commit : elle appelle le modèle, aucune
        // connexion à la base ne doit attendre sa réponse.
        if (req.autoAssign()) {
            autoAssign(slug, projectId, issueId, userId);
        }
        return saved;
    }

    /** Écrit la spec (description), le type, les labels, l'effort et la priorité directement sur l'issue. */
    private void applyToIssue(String slug, Long projectId, Long issueId, Long userId, ApproveSpecRequest req) {
        UpdateIssueRequest upd = new UpdateIssueRequest();
        if (req.spec() != null && !req.spec().isBlank()) upd.setDescription(req.spec().trim());
        if (req.storyPoints() != null) upd.setStoryPoints(req.storyPoints());
        if (req.priority() != null && !req.priority().isBlank()) {
            try { upd.setPriority(IssuePriority.valueOf(req.priority().trim().toUpperCase(java.util.Locale.ROOT))); }
            catch (IllegalArgumentException ignored) { /* priorité invalide → on ignore */ }
        }
        Long typeId = resolveTypeId(projectId, req.type());
        if (typeId != null) upd.setTypeId(typeId);
        List<Long> labelIds = resolveLabelIds(projectId, req.labels());
        if (!labelIds.isEmpty()) upd.setLabelIds(labelIds);
        issueService.updateIssue(slug, projectId, issueId, upd, userId);
    }

    /** Assigne l'issue via le smart-assign (Qwen) — best-effort, ne bloque pas l'approbation. */
    private void autoAssign(String slug, Long projectId, Long issueId, Long userId) {
        try {
            SmartAssignResponse rec = smartAssignService.recommend(slug, projectId, issueId, userId);
            if (rec != null && rec.getRecommended() != null && rec.getRecommended().getUserId() != null) {
                UpdateIssueRequest upd = new UpdateIssueRequest();
                upd.setAssigneeId(rec.getRecommended().getUserId());
                issueService.updateIssue(slug, projectId, issueId, upd, userId);
            }
        } catch (Exception ex) {
            log.warn("Auto-assign IA échoué (issue={}): {}", issueId, ex.getMessage());
        }
    }

    /** Résout un nom de type vers l'ID d'un type EXISTANT du projet (insensible à la casse) ; null sinon. */
    private Long resolveTypeId(Long projectId, String name) {
        if (name == null || name.isBlank()) return null;
        return issueTypeRepository.findByProjectIdOrderByName(projectId).stream()
            .filter(t -> t.getName().equalsIgnoreCase(name.trim()))
            .map(IssueType::getId)
            .findFirst().orElse(null);
    }

    /** Résout des noms de labels vers les IDs des labels EXISTANTS du projet (insensible à la casse). */
    private List<Long> resolveLabelIds(Long projectId, List<String> names) {
        if (names == null || names.isEmpty()) return List.of();
        List<ProjectLabel> projectLabels = projectLabelRepository.findByProjectIdOrderByNameAsc(projectId);
        List<Long> ids = new ArrayList<>();
        for (String name : names) {
            if (name == null) continue;
            projectLabels.stream()
                .filter(pl -> pl.getName().equalsIgnoreCase(name.trim()))
                .findFirst()
                .ifPresent(pl -> { if (!ids.contains(pl.getId())) ids.add(pl.getId()); });
        }
        return ids;
    }

    // =========================================================================
    // Data flywheel — capture des générations de spec (best-effort, opt-in workspace)
    // =========================================================================

    // =========================================================================
    // Helpers — LLM
    // =========================================================================

    private JsonNode callLlm(IssueFacts facts, List<KnowledgeNode> hits, String tier) throws Exception {
        String content = llm.chatCompletion(
            systemPrompt(hits, facts.projectLabels(), facts.projectTypes()), userPrompt(facts), true, tier);
        return objectMapper.readTree(content);
    }

    private String systemPrompt(List<KnowledgeNode> hits, List<String> projectLabels, List<String> projectTypes) {
        StringBuilder sb = new StringBuilder();
        sb.append("You are TaskForce AI, a senior software architect. From an issue, you produce an ")
          .append("actionable specification and an execution prompt ready to paste into Claude Code.\n\n")
          .append("Answer STRICTLY in JSON (no text outside the JSON), with these keys:\n")
          .append("- \"spec\" (markdown string): Context, Acceptance criteria (checklist), ")
          .append("Technical approach, Risks and points of attention.\n")
          .append("- \"executionPrompt\" (string): a self-contained, precise prompt for a coding agent ")
          .append("(Claude Code): what to implement, files and layers involved, repository constraints, ")
          .append("definition of done, expected tests. Write it in the imperative, without filler.\n")
          .append("- \"breakdown\" (array of strings): the ordered subtasks.\n")
          .append("- \"storyPoints\" (number): effort estimate on the Fibonacci scale (1, 2, 3, 5, 8, 13).\n")
          .append("- \"priority\" (string): one of NONE, LOW, MEDIUM, HIGH, URGENT.\n")
          .append("- \"type\" (string): the type EXACTLY from this list (otherwise null): ")
          .append(projectTypes.isEmpty() ? "(no type defined)" : String.join(", ", projectTypes)).append(".\n")
          .append("- \"labels\" (array of strings): 0 to 3 labels EXACTLY from this list (otherwise []): ")
          .append(projectLabels.isEmpty() ? "(no label defined)" : String.join(", ", projectLabels)).append(".\n\n")
          .append("Ground yourself in the real project context (Brain OS) below; do not invent ")
          .append("conventions, labels or types outside the lists. Answer in the language of the issue.");
        if (!hits.isEmpty()) {
            sb.append("\n\nProject context (Brain OS):\n");
            for (KnowledgeNode n : hits) {
                String c = n.getContent() != null ? n.getContent() : "";
                if (c.length() > 500) c = c.substring(0, 500) + "…";
                sb.append("- [").append(n.getDomain()).append("] ").append(n.getTitle())
                  .append(": ").append(c.replace("\n", " ")).append("\n");
            }
        }
        return sb.toString();
    }

    private String userPrompt(IssueFacts facts) {
        StringBuilder sb = new StringBuilder();
        sb.append("Issue ").append(facts.identifier()).append("\n");
        sb.append("Title: ").append(facts.title()).append("\n");
        if (facts.typeName() != null) sb.append("Type: ").append(facts.typeName()).append("\n");
        if (facts.priority() != null) sb.append("Priority: ").append(facts.priority()).append("\n");
        sb.append("Description:\n")
          .append(facts.description() != null && !facts.description().isBlank()
              ? facts.description() : "(no description)");
        return sb.toString();
    }

    // =========================================================================
    // Helpers — repli déterministe (jamais inventé : structure fondée sur l'issue + RAG)
    // =========================================================================

    private IssueSpecDraft fallbackDraft(IssueFacts facts, List<SimilarNode> similar) {
        String desc = facts.description() != null && !facts.description().isBlank()
            ? facts.description() : "_(no description yet)_";

        String spec = "## Context\n" + desc + "\n\n"
            + "## Acceptance criteria\n- [ ] To be defined\n\n"
            + "## Technical approach\n_To be completed (AI unavailable: structural draft)._\n\n"
            + "## Points of attention\n- Follow the conventions of the repository.";

        String prompt = "Implement issue " + facts.identifier() + ": " + facts.title() + ".\n\n"
            + "Description:\n" + desc + "\n\n"
            + "Constraints: follow the conventions of the repository (architecture, naming, tests). "
            + "Deliver a diff ready for review, with its tests.";

        List<String> breakdown = List.of(
            "Analyze the request and the files involved",
            "Implement the change",
            "Add the tests",
            "Check the build and the linter");

        return new IssueSpecDraft(spec, prompt, breakdown, similar, "fallback", List.of(), null, null, null);
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

    private String identifier(Issue issue) {
        return issue.getProject().getIdentifier() + "-" + issue.getSequenceNumber();
    }

    private String assembleContent(ApproveSpecRequest req) {
        StringBuilder sb = new StringBuilder(req.spec() != null ? req.spec() : "");
        if (req.breakdown() != null && !req.breakdown().isEmpty()) {
            sb.append("\n\n## Breakdown\n");
            for (String step : req.breakdown()) sb.append("- ").append(step).append("\n");
        }
        if (req.executionPrompt() != null && !req.executionPrompt().isBlank()) {
            sb.append("\n\n## Execution prompt (Claude Code)\n```text\n")
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

    /** Retourne le nom canonique de {@code raw} s'il figure (insensible à la casse) dans {@code allowed} ; null sinon. */
    private String matchName(String raw, List<String> allowed) {
        if (raw == null || raw.isBlank()) return null;
        return allowed.stream().filter(a -> a.equalsIgnoreCase(raw.trim())).findFirst().orElse(null);
    }

    /** Valide une priorité renvoyée par le LLM ; null si absente/invalide. */
    private String normalizePriority(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return IssuePriority.valueOf(raw.trim().toUpperCase(java.util.Locale.ROOT)).name();
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
