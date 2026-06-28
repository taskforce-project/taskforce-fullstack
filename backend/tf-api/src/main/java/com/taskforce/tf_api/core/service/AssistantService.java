package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Service pour l'assistant IA du workspace.
 *
 * Construit le contexte workspace (projets, membres, issues récentes)
 * puis délègue à GroqService pour la complétion LLM.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AssistantService {

    private final WorkspaceRepository       workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final ProjectRepository         projectRepository;
    private final IssueRepository           issueRepository;
    private final GroqService               groqService;
    private final BrainSearchService        brainSearchService;

    @Value("${ai.groq.assistant-model:llama-3.3-70b-versatile}")
    private String assistantModel;

    /**
     * Génère une réponse LLM complète (non-streamée) pour le message donné,
     * en injectant le contexte du workspace dans le system prompt.
     *
     * @param slug    identifiant du workspace
     * @param message message envoyé par l'utilisateur
     * @return réponse textuelle du LLM
     */
    @Transactional
    public String chat(String slug, String message) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + slug));

        // RAG : retrieval des nodes Brain OS les plus pertinents pour la question.
        List<KnowledgeNode> relevant = brainSearchService.retrieveRelevant(workspace.getId(), message, 5);

        String systemPrompt = buildSystemPrompt(workspace) + brainContextBlock(relevant);
        log.debug("Assistant chat — workspace={} model={} brainNodes={}", slug, assistantModel, relevant.size());

        // Jamais de 500 : si Groq est indisponible (clé absente/invalide, réseau, quota),
        // on renvoie une réponse de repli utile au lieu de propager l'erreur.
        try {
            return groqService.chatCompletion(assistantModel, systemPrompt, message, false);
        } catch (Exception ex) {
            log.warn("Assistant Groq indisponible (workspace={}): {}", slug, ex.getMessage());
            return fallbackAnswer(workspace, relevant);
        }
    }

    /** Bloc de contexte injecté dans le system prompt : les notes Brain OS pertinentes. */
    private String brainContextBlock(List<KnowledgeNode> nodes) {
        if (nodes.isEmpty()) return "";
        StringBuilder sb = new StringBuilder("\nRelevant Brain OS knowledge (use it to ground your answer):\n");
        for (KnowledgeNode n : nodes) {
            String content = n.getContent() != null ? n.getContent() : "";
            if (content.length() > 600) content = content.substring(0, 600) + "…";
            sb.append("- [").append(n.getType()).append(" · ").append(n.getDomain()).append("] ")
              .append(n.getTitle()).append("\n");
            if (!content.isBlank()) sb.append("  ").append(content.replace("\n", " ")).append("\n");
        }
        return sb.toString();
    }

    /**
     * Réponse de repli lorsque l'IA n'est pas joignable. Reste utile : expose les notes
     * Brain OS pertinentes trouvées (le retrieval fonctionne même sans clé Groq).
     */
    private String fallbackAnswer(Workspace workspace, List<KnowledgeNode> relevant) {
        long projects = projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId()).size();
        long members  = workspaceMemberRepository.findByWorkspaceId(workspace.getId()).size();
        StringBuilder sb = new StringBuilder();
        sb.append(String.format(
            "L'assistant IA (LLM) est momentanément indisponible — configurez GROQ_API_KEY pour des réponses génératives. "
            + "Aperçu de « %s » : %d projet(s), %d membre(s).",
            workspace.getName(), projects, members));
        if (!relevant.isEmpty()) {
            sb.append("\n\nNotes pertinentes trouvées dans votre Brain OS :");
            for (KnowledgeNode n : relevant) {
                sb.append("\n• ").append(n.getTitle())
                  .append(" (").append(n.getDomain()).append(")");
            }
        }
        return sb.toString();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private String buildSystemPrompt(Workspace workspace) {
        StringBuilder sb = new StringBuilder();
        sb.append("You are Taskforce AI, a helpful project management assistant for the workspace \"")
          .append(workspace.getName()).append("\".\n");
        sb.append("Be concise, professional, and helpful. Answer in the same language as the user's message.\n\n");

        // Membres
        List<WorkspaceMember> members = workspaceMemberRepository.findByWorkspaceId(workspace.getId());
        if (!members.isEmpty()) {
            sb.append("Team members (").append(members.size()).append("):\n");
            members.stream().limit(20).forEach(wm -> {
                User u = wm.getUser();
                if (u != null) {
                    sb.append("- ").append(Objects.toString(u.getDisplayName(), u.getEmail()))
                      .append(" (").append(wm.getRole()).append(")\n");
                }
            });
            sb.append("\n");
        }

        // Projets actifs
        List<com.taskforce.tf_api.core.model.Project> projects =
            projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId());
        if (!projects.isEmpty()) {
            sb.append("Projects: ").append(projects.size()).append(" total\n");
        }

        // Métriques analytiques réelles (QA2-17) — le LLM peut répondre aux questions chiffrées
        appendMetrics(sb, projects, members);

        // Issues récentes (20 max) pour donner du contexte
        List<Issue> recentIssues = findRecentIssues(workspace.getId());
        if (!recentIssues.isEmpty()) {
            sb.append("Recent issues (last 20):\n");
            recentIssues.forEach(i -> sb.append(String.format(
                "- [%s] %s (priority: %s, status: %s)\n",
                (i.getProject() != null && i.getProject().getIdentifier() != null)
                    ? i.getProject().getIdentifier() + "-" + i.getSequenceNumber()
                    : "?",
                i.getTitle(),
                i.getPriority(),
                i.getStatus() != null ? i.getStatus().getName() : "?"
            )));
        }

        return sb.toString();
    }

    /**
     * Injecte un bloc de métriques chiffrées (réelles) pour permettre à l'assistant
     * de répondre aux questions analytiques : volumes, throughput, charge (QA2-17).
     */
    private void appendMetrics(StringBuilder sb,
                               List<com.taskforce.tf_api.core.model.Project> projects,
                               List<WorkspaceMember> members) {
        if (projects.isEmpty()) return;
        try {
            List<Long> ids = projects.stream()
                .map(com.taskforce.tf_api.core.model.Project::getId)
                .toList();

            java.time.LocalDateTime now = java.time.LocalDateTime.now();
            java.time.LocalDateTime d7  = now.minusDays(7);
            java.time.LocalDateTime d30 = now.minusDays(30);

            long totalIssues  = ids.stream().mapToLong(issueRepository::countByProjectId).sum();
            long openIssues   = ids.stream().mapToLong(issueRepository::countOpenIssues).sum();
            long createdLast7 = issueRepository.countCreatedBetween(ids, d7, now);
            long doneLast7    = issueRepository.countCompletedBetween(ids, d7, now);
            long doneLast30   = issueRepository.countCompletedBetween(ids, d30, now);

            sb.append("\nWorkspace metrics (real-time, use these exact numbers when asked):\n");
            sb.append("- Total issues: ").append(totalIssues)
              .append(" (open: ").append(openIssues)
              .append(", closed: ").append(Math.max(0, totalIssues - openIssues)).append(")\n");
            sb.append("- Issues created in the last 7 days: ").append(createdLast7).append("\n");
            sb.append("- Issues completed in the last 7 days: ").append(doneLast7)
              .append(" (velocity ≈ ").append(doneLast7).append("/week)\n");
            sb.append("- Issues completed in the last 30 days: ").append(doneLast30).append("\n");

            // Détail par projet (ouvertes / total)
            sb.append("Per project (open/total):\n");
            projects.stream().limit(12).forEach(p -> sb.append("- ")
                .append(p.getName())
                .append(": ").append(issueRepository.countOpenIssues(p.getId()))
                .append("/").append(issueRepository.countByProjectId(p.getId()))
                .append("\n"));

            // Charge : issues ouvertes assignées par membre (top 8)
            java.util.Map<Long, String> nameByUserId = new java.util.HashMap<>();
            for (WorkspaceMember wm : members) {
                if (wm.getUser() != null) {
                    nameByUserId.put(wm.getUser().getId(),
                        Objects.toString(wm.getUser().getDisplayName(), wm.getUser().getEmail()));
                }
            }
            List<Object[]> load = issueRepository.countOpenIssuesGroupedByAssignee(ids);
            if (!load.isEmpty()) {
                sb.append("Current workload (open assigned issues per member):\n");
                load.stream()
                    .sorted((a, b) -> Long.compare(((Number) b[1]).longValue(), ((Number) a[1]).longValue()))
                    .limit(8)
                    .forEach(row -> {
                        Long uid = ((Number) row[0]).longValue();
                        long cnt = ((Number) row[1]).longValue();
                        sb.append("- ").append(nameByUserId.getOrDefault(uid, "User #" + uid))
                          .append(": ").append(cnt).append(" open issue(s)\n");
                    });
            }
            sb.append("\n");
        } catch (Exception ex) {
            log.warn("Cannot build assistant metrics block: {}", ex.getMessage());
        }
    }

    /**
     * Récupère les 20 issues les plus récentes de tous les projets du workspace.
     */
    private List<Issue> findRecentIssues(Long workspaceId) {
        try {
            var projects = projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId);
            return projects.stream()
                .limit(5)
                .flatMap(p -> issueRepository
                    .findByProjectIdOrderBySequenceNumberDesc(p.getId(),
                        org.springframework.data.domain.PageRequest.of(0, 4))
                    .stream())
                .limit(20)
                .toList();
        } catch (Exception ex) {
            log.warn("Cannot load recent issues for context: {}", ex.getMessage());
            return List.of();
        }
    }
}
