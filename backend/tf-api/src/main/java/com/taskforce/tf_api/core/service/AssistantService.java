package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
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
    public String chat(String slug, String message) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + slug));

        String systemPrompt = buildSystemPrompt(workspace);
        log.debug("Assistant chat — workspace={} model={}", slug, assistantModel);

        // Jamais de 500 : si Groq est indisponible (clé absente/invalide, réseau, quota),
        // on renvoie une réponse de repli utile au lieu de propager l'erreur.
        try {
            return groqService.chatCompletion(assistantModel, systemPrompt, message, false);
        } catch (Exception ex) {
            log.warn("Assistant Groq indisponible (workspace={}): {}", slug, ex.getMessage());
            return fallbackAnswer(workspace);
        }
    }

    /** Réponse de repli lorsque l'IA n'est pas joignable (reste informative). */
    private String fallbackAnswer(Workspace workspace) {
        long projects = projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId()).size();
        long members  = workspaceMemberRepository.findByWorkspaceId(workspace.getId()).size();
        return String.format(
            "L'assistant IA est momentanément indisponible. En attendant, voici un aperçu de « %s » : "
            + "%d projet(s) et %d membre(s). "
            + "Si le problème persiste, vérifiez la configuration de la clé Groq (GROQ_API_KEY).",
            workspace.getName(), projects, members
        );
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
        List<?> projects = projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId());
        if (!projects.isEmpty()) {
            sb.append("Projects: ").append(projects.size()).append(" total\n\n");
        }

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
