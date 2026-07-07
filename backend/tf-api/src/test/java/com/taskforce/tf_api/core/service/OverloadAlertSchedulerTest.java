package com.taskforce.tf_api.core.service;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link OverloadAlertScheduler}.
 * Le cron scanne les workspaces, détecte les assignés en surcharge (> seuil de tâches ouvertes)
 * et délègue la notification aux managers (OWNER/ADMIN) via {@link NotificationService#notifyOverload}.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("OverloadAlertScheduler")
class OverloadAlertSchedulerTest {

    @Mock private WorkspaceRepository       workspaceRepository;
    @Mock private ProjectRepository         projectRepository;
    @Mock private IssueRepository           issueRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private NotificationService       notificationService;

    @InjectMocks private OverloadAlertScheduler scheduler;

    private Workspace workspace;
    private User manager;
    private User overloadedMember;

    @BeforeEach
    void setup() {
        ReflectionTestUtils.setField(scheduler, "overloadThreshold", 8);

        workspace = Workspace.builder().id(1L).slug("acme").build();
        manager = User.builder().id(10L).email("owner@it.dev").build();
        overloadedMember = User.builder().id(20L).email("member@it.dev").build();
    }

    private WorkspaceMember member(User user, WorkspaceRole role) {
        return WorkspaceMember.builder().user(user).role(role).build();
    }

    @Test
    @DisplayName("membre en surcharge trouvé → notification envoyée aux managers")
    void scanOverload_withOverloadedMember_shouldNotify() {
        when(workspaceRepository.findAll()).thenReturn(List.of(workspace));
        when(projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(1L))
            .thenReturn(List.of(Project.builder().id(100L).build()));
        when(workspaceMemberRepository.findByWorkspaceId(1L)).thenReturn(List.of(
            member(manager, WorkspaceRole.OWNER),
            member(overloadedMember, WorkspaceRole.MEMBER)
        ));
        // assignee 20 avec 12 tâches ouvertes > seuil 8
        when(issueRepository.countOpenIssuesGroupedByAssignee(anyList()))
            .thenReturn(List.<Object[]>of(new Object[]{20L, 12L}));

        scheduler.scanOverload();

        verify(notificationService).notifyOverload(
            eq(workspace), eq(overloadedMember), eq(12), eq(8), anyList());
    }

    @Test
    @DisplayName("aucun membre en surcharge (sous le seuil) → aucune notification")
    void scanOverload_underThreshold_shouldNotNotify() {
        when(workspaceRepository.findAll()).thenReturn(List.of(workspace));
        when(projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(1L))
            .thenReturn(List.of(Project.builder().id(100L).build()));
        when(workspaceMemberRepository.findByWorkspaceId(1L)).thenReturn(List.of(
            member(manager, WorkspaceRole.OWNER),
            member(overloadedMember, WorkspaceRole.MEMBER)
        ));
        // 3 tâches ouvertes <= seuil 8
        when(issueRepository.countOpenIssuesGroupedByAssignee(anyList()))
            .thenReturn(List.<Object[]>of(new Object[]{20L, 3L}));

        scheduler.scanOverload();

        verify(notificationService, never()).notifyOverload(any(), any(), anyInt(), anyInt(), anyList());
    }

    @Test
    @DisplayName("workspace sans projet → aucun scan, aucune notification")
    void scanOverload_noProject_shouldSkip() {
        when(workspaceRepository.findAll()).thenReturn(List.of(workspace));
        when(projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());

        scheduler.scanOverload();

        verify(notificationService, never()).notifyOverload(any(), any(), anyInt(), anyInt(), anyList());
        verify(issueRepository, never()).countOpenIssuesGroupedByAssignee(anyList());
    }

    @Test
    @DisplayName("aucun manager (OWNER/ADMIN) → workspace ignoré")
    void scanOverload_noManagers_shouldSkip() {
        when(workspaceRepository.findAll()).thenReturn(List.of(workspace));
        when(projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(1L))
            .thenReturn(List.of(Project.builder().id(100L).build()));
        when(workspaceMemberRepository.findByWorkspaceId(1L)).thenReturn(List.of(
            member(overloadedMember, WorkspaceRole.MEMBER)
        ));

        scheduler.scanOverload();

        verify(notificationService, never()).notifyOverload(any(), any(), anyInt(), anyInt(), anyList());
        verify(issueRepository, never()).countOpenIssuesGroupedByAssignee(anyList());
    }

    @Test
    @DisplayName("assigné en surcharge absent des membres du workspace → aucune notification")
    void scanOverload_assigneeNotMember_shouldNotNotify() {
        when(workspaceRepository.findAll()).thenReturn(List.of(workspace));
        when(projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(1L))
            .thenReturn(List.of(Project.builder().id(100L).build()));
        when(workspaceMemberRepository.findByWorkspaceId(1L)).thenReturn(List.of(
            member(manager, WorkspaceRole.OWNER)
        ));
        // assignee 999 inconnu (non membre)
        lenient().when(issueRepository.countOpenIssuesGroupedByAssignee(anyList()))
            .thenReturn(List.<Object[]>of(new Object[]{999L, 15L}));

        scheduler.scanOverload();

        verify(notificationService, never()).notifyOverload(any(), any(), anyInt(), anyInt(), anyList());
    }
}
