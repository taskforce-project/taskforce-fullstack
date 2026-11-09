package com.taskforce.tf_api.core.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.IssueCommentHitResponse;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueComment;
import com.taskforce.tf_api.core.repository.IssueCommentRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.core.service.brain.SearchExcerpt;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * La recherche dans les commentaires (Ctrl+K, R141, séance n°20) : « pas assez deep », disait la Présidence. On retrouve
 * une issue par ce qu'on a écrit dessous, sur les projets que la personne voit, jamais les archivées. Chaque mot compte,
 * en préfixe, la configuration {@code simple} de PostgreSQL ne dépend pas de la langue.
 */
@Service
@RequiredArgsConstructor
public class IssueCommentSearchService {

    /** Les issues rendues au plus. */
    public static final int MAX = 20;
    /** Plusieurs commentaires d'une même issue répondent souvent : on en lit plus qu'on n'en rend. */
    private static final int READ_FACTOR = 3;

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final ProjectVisibilityGuard visibilityGuard;
    private final IssueCommentRepository commentRepository;

    /**
     * Les issues dont un commentaire répond à {@code query}, le commentaire le plus récent d'abord, une ligne par issue.
     * Rien quand le texte n'a pas de mot de deux caractères ; {@code limit} est borné à {@link #MAX}.
     */
    @Transactional(readOnly = true)
    public List<IssueCommentHitResponse> search(String slug, Long userId, String query, int limit) {
        var workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found"));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), userId)) {
            throw new BusinessException("Access denied");
        }
        List<String> terms = BrainSearchService.terms(query);
        if (terms.isEmpty()) return List.of();
        List<Long> visible = visibilityGuard.viewableProjectIds(workspace.getId(), userId);
        if (visible.isEmpty()) return List.of();

        int max = Math.min(Math.max(limit, 1), MAX);
        String tsquery = String.join(" & ", terms.stream().map(term -> term + ":*").toList());
        Map<Long, IssueComment> byIssue = new LinkedHashMap<>();
        for (IssueComment comment : commentRepository.searchInProjects(visible, tsquery, max * READ_FACTOR)) {
            byIssue.putIfAbsent(comment.getIssue().getId(), comment);
        }
        return byIssue.values().stream().limit(max).map(comment -> toHit(comment, terms)).toList();
    }

    private static IssueCommentHitResponse toHit(IssueComment comment, List<String> terms) {
        Issue issue = comment.getIssue();
        return new IssueCommentHitResponse(issue.getId(), issue.getProject().getId(),
            issue.getProject().getIdentifier() + "-" + issue.getSequenceNumber(), issue.getTitle(),
            SearchExcerpt.around(comment.getContent(), terms));
    }
}
