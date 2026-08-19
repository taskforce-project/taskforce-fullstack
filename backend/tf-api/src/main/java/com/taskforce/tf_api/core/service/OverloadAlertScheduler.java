package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Job planifié qui détecte les membres en <b>surcharge</b> (trop de tâches ouvertes assignées)
 * et notifie les responsables (OWNER/ADMIN) du workspace. La déduplication est assurée par
 * {@link NotificationService#notifyOverload} (pas de doublon tant que l'alerte n'est pas acquittée).
 *
 * <p>Seuil surchargeable via {@code taskforce.alerts.overload-threshold} (défaut 8 tâches ouvertes),
 * cron via {@code taskforce.alerts.overload-cron}.</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OverloadAlertScheduler {

    @Value("${taskforce.alerts.overload-threshold:8}")
    private int overloadThreshold;

    private final WorkspaceRepository       workspaceRepository;
    private final ProjectRepository         projectRepository;
    private final IssueRepository           issueRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final NotificationService       notificationService;

    @Scheduled(cron = "${taskforce.alerts.overload-cron:0 30 8 * * *}")
    @Transactional
    public void scanOverload() {
        int alerted = 0;
        for (Workspace workspace : workspaceRepository.findAll()) {
            List<Project> projects = projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId());
            if (projects.isEmpty()) {
                continue;
            }
            List<Long> projectIds = projects.stream().map(Project::getId).toList();

            List<WorkspaceMember> members = workspaceMemberRepository.findByWorkspaceId(workspace.getId());
            List<User> managers = members.stream()
                .filter(m -> m.getRole() == WorkspaceRole.OWNER || m.getRole() == WorkspaceRole.ADMIN)
                .map(WorkspaceMember::getUser)
                .toList();
            if (managers.isEmpty()) {
                continue;
            }
            Map<Long, User> userById = members.stream()
                .collect(Collectors.toMap(m -> m.getUser().getId(), WorkspaceMember::getUser, (a, b) -> a));

            for (Object[] row : issueRepository.countOpenIssuesGroupedByAssignee(projectIds)) {
                Long assigneeId = ((Number) row[0]).longValue();
                int openCount   = ((Number) row[1]).intValue();
                if (openCount <= overloadThreshold) {
                    continue;
                }
                User member = userById.get(assigneeId);
                if (member == null) {
                    continue;
                }
                notificationService.notifyOverload(workspace, member, openCount, overloadThreshold, managers);
                alerted++;
            }
        }
        if (alerted > 0) {
            log.info("Scan surcharge : {} alerte(s) de membre en surcharge émise(s)", alerted);
        }
    }
}
