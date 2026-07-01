package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.ApplyRedistributionRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.dto.response.ApplyRedistributionResponse;
import com.taskforce.tf_api.core.dto.response.MemberLoadResponse;
import com.taskforce.tf_api.core.dto.response.RedistributionMoveResponse;
import com.taskforce.tf_api.core.dto.response.RedistributionPlanResponse;
import com.taskforce.tf_api.core.dto.response.SmartAssignCandidateResponse;
import com.taskforce.tf_api.core.dto.response.SmartAssignResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
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
 * Redistribution proposée puis validée par un manager (PROD-1.12, trou CDC #4 « ajustements dynamiques »).
 *
 * <p>La surcharge est <b>cross-projets</b> (un membre trop chargé sur l'ensemble du workspace) — la logique
 * vit donc au niveau workspace, contrairement au Smart Assign qui est scopé par projet. On ne réassigne
 * <b>jamais</b> automatiquement : {@link #preview} calcule un plan (déplacements motivés + charge avant/après),
 * un OWNER/ADMIN l'applique via {@link #apply} ou le rejette (human-in-the-loop assumé).</p>
 *
 * <p>Règles de sûreté : seules les issues <i>déplaçables</i> sont candidates (statut non démarré / backlog,
 * <b>jamais URGENT ni en cours</b>), et on ne déplace jamais une tâche vers un membre qui deviendrait à son
 * tour surchargé. Le scoring des candidats est délégué à {@link SmartAssignService}.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RedistributionService {

    @Value("${taskforce.alerts.overload-threshold:8}")
    private int overloadThreshold;

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final ProjectRepository projectRepository;
    private final IssueRepository issueRepository;
    private final SmartAssignService smartAssignService;
    private final IssueService issueService;
    private final AuthorizationService authorizationService;
    private final AuditService auditService;

    /**
     * Calcule un plan de redistribution (preview, aucune écriture d'assignation).
     *
     * @param targetUserId si non nul, limite le plan à ce membre surchargé ; sinon tous les surchargés.
     */
    @Transactional
    public RedistributionPlanResponse preview(String slug, Long requestingUserId, Long targetUserId) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        authorizationService.requireManager(workspace.getId(), requestingUserId);

        List<Project> projects = projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId());
        if (projects.isEmpty()) {
            return emptyPlan();
        }
        List<Long> projectIds = projects.stream().map(Project::getId).toList();

        Map<Long, User> userById = workspaceMemberRepository.findByWorkspaceId(workspace.getId()).stream()
            .map(WorkspaceMember::getUser)
            .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a, LinkedHashMap::new));

        // Charge ouverte courante par membre (cross-projets), comme OverloadAlertScheduler.
        Map<Long, Integer> loadByUser = new HashMap<>();
        for (Object[] row : issueRepository.countOpenIssuesGroupedByAssignee(projectIds)) {
            loadByUser.put(((Number) row[0]).longValue(), ((Number) row[1]).intValue());
        }
        // Charge projetée, mutée au fil du plan pour ne pas sur-charger une cible.
        Map<Long, Integer> projected = new HashMap<>(loadByUser);

        List<Long> overloaded = loadByUser.entrySet().stream()
            .filter(e -> e.getValue() > overloadThreshold)
            .filter(e -> targetUserId == null || e.getKey().equals(targetUserId))
            .filter(e -> userById.containsKey(e.getKey()))
            .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
            .map(Map.Entry::getKey)
            .toList();

        List<RedistributionMoveResponse> moves = new ArrayList<>();
        Set<Long> affected = new HashSet<>();

        for (Long memberId : overloaded) {
            affected.add(memberId);

            List<Issue> movable = issueRepository.findByWorkspaceSlugAndAssigneeId(slug, memberId).stream()
                .filter(RedistributionService::isMovable)
                .sorted(Comparator
                    .comparingInt((Issue i) -> priorityRank(i.getPriority()))   // moins prioritaire d'abord
                    .thenComparing(Issue::getId, Comparator.reverseOrder()))     // plus récente d'abord
                .toList();

            for (Issue issue : movable) {
                if (projected.getOrDefault(memberId, 0) <= overloadThreshold) {
                    break; // le membre n'est plus surchargé dans le plan
                }
                Project project = issue.getProject();
                SmartAssignResponse ranked = smartAssignService.rankForRedistribution(workspace, project, issue);
                SmartAssignCandidateResponse target = pickTarget(ranked, memberId, projected);
                if (target == null) {
                    continue; // aucun meilleur candidat sans créer une nouvelle surcharge → on laisse l'issue
                }

                Long toId = target.getUserId();
                projected.merge(memberId, -1, Integer::sum);
                projected.merge(toId, 1, Integer::sum);
                affected.add(toId);

                moves.add(RedistributionMoveResponse.builder()
                    .issueId(issue.getId())
                    .issueTitle(issue.getTitle())
                    .projectId(project.getId())
                    .projectName(project.getName())
                    .fromUserId(memberId)
                    .fromName(displayName(userById.get(memberId)))
                    .toUserId(toId)
                    .toName(target.getDisplayName() != null ? target.getDisplayName() : target.getEmail())
                    .toScore(target.getScore())
                    .reason(target.getReason())
                    .priority(issue.getPriority() != null ? issue.getPriority().name() : IssuePriority.NONE.name())
                    .storyPoints(issue.getStoryPoints())
                    .build());
            }
        }

        List<MemberLoadResponse> loads = affected.stream()
            .sorted()
            .map(id -> MemberLoadResponse.builder()
                .userId(id)
                .name(displayName(userById.get(id)))
                .openBefore(loadByUser.getOrDefault(id, 0))
                .openAfter(projected.getOrDefault(id, 0))
                .overloaded(loadByUser.getOrDefault(id, 0) > overloadThreshold)
                .build())
            .toList();

        return RedistributionPlanResponse.builder()
            .threshold(overloadThreshold)
            .totalMoves(moves.size())
            .moves(moves)
            .memberLoads(loads)
            .build();
    }

    /**
     * Applique un plan de redistribution validé par un manager. Chaque déplacement réassigne l'issue via
     * {@link IssueService#updateIssue} (réutilise activité, temps réel et notifications). Journalisé (audit).
     */
    @Transactional
    public ApplyRedistributionResponse apply(String slug, Long requestingUserId, ApplyRedistributionRequest request) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        authorizationService.requireManager(workspace.getId(), requestingUserId);

        int applied = 0;
        int skipped = 0;
        for (ApplyRedistributionRequest.Move move : request.getMoves()) {
            Issue issue = issueRepository.findById(move.getIssueId()).orElse(null);
            // L'issue doit exister ET appartenir à ce workspace (défense contre l'IDOR).
            if (issue == null || !issue.getProject().getWorkspace().getId().equals(workspace.getId())) {
                skipped++;
                continue;
            }
            // La cible doit être membre du workspace.
            if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), move.getToUserId())) {
                skipped++;
                continue;
            }
            UpdateIssueRequest update = new UpdateIssueRequest();
            update.setAssigneeId(move.getToUserId());
            issueService.updateIssue(slug, issue.getProject().getId(), issue.getId(), update, requestingUserId);
            applied++;
        }

        auditService.record(workspace.getId(), requestingUserId, AuditService.REDISTRIBUTION_APPLY,
            "WORKSPACE", workspace.getId().toString(),
            Map.of("applied", applied, "skipped", skipped));

        log.info("Redistribution appliquée sur workspace {} : {} déplacement(s), {} ignoré(s)",
            slug, applied, skipped);
        return ApplyRedistributionResponse.builder().applied(applied).skipped(skipped).build();
    }

    /**
     * Meilleur candidat cible parmi (recommandé + alternatives), déjà triés par score décroissant :
     * exclut le membre courant et tout membre qui deviendrait surchargé une fois l'issue ajoutée.
     */
    private SmartAssignCandidateResponse pickTarget(SmartAssignResponse ranked, Long excludeUserId,
                                                    Map<Long, Integer> projected) {
        List<SmartAssignCandidateResponse> candidates = new ArrayList<>();
        if (ranked.getRecommended() != null) {
            candidates.add(ranked.getRecommended());
        }
        if (ranked.getAlternatives() != null) {
            candidates.addAll(ranked.getAlternatives());
        }
        return candidates.stream()
            .filter(c -> !c.getUserId().equals(excludeUserId))
            .filter(c -> projected.getOrDefault(c.getUserId(), 0) < overloadThreshold)
            .findFirst()
            .orElse(null);
    }

    /** Une issue est déplaçable si elle n'est ni démarrée/terminée/annulée, ni URGENTE. */
    private static boolean isMovable(Issue issue) {
        IssueStatusCategory category = issue.getStatus().getCategory();
        boolean notStartedOrDone = category == IssueStatusCategory.BACKLOG
            || category == IssueStatusCategory.UNSTARTED;
        boolean notUrgent = issue.getPriority() != IssuePriority.URGENT;
        return notStartedOrDone && notUrgent;
    }

    /** Ordre de déplacement : on bouge d'abord les tâches les moins prioritaires (LOW → NONE → MEDIUM → HIGH). */
    private static int priorityRank(IssuePriority priority) {
        if (priority == null) {
            return 1;
        }
        return switch (priority) {
            case LOW -> 0;
            case NONE -> 1;
            case MEDIUM -> 2;
            case HIGH -> 3;
            case URGENT -> 4; // exclu par isMovable, mais borné par sûreté
        };
    }

    private static String displayName(User user) {
        if (user == null) {
            return "?";
        }
        return user.getDisplayName() != null ? user.getDisplayName() : user.getEmail();
    }

    private RedistributionPlanResponse emptyPlan() {
        return RedistributionPlanResponse.builder()
            .threshold(overloadThreshold)
            .totalMoves(0)
            .moves(List.of())
            .memberLoads(List.of())
            .build();
    }
}
