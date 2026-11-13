package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.dto.response.DeliveryRunActivityResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.dto.response.ProjectRunResponse;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunEvent;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunEventRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.dto.PageResponse;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Les missions d'un projet et leurs demandes, en une lecture (la vue du workflow, R166) : seul un membre de l'espace qui
 * voit le projet lit quelque chose ; chaque mission vient avec son étape en cours, ses liens et ses demandes ouvertes,
 * page par page, bornée par projet.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ProjectDeliveryService : les missions d'un projet")
class ProjectDeliveryServiceTest {

    @Mock private DeliveryRunRepository runRepository;
    @Mock private DeliveryRunEventRepository eventRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private BrainAccessGuard access;
    @Mock private DeliveryService deliveryService;
    @Mock private DeliveryActivityService activityService;

    @InjectMocks private ProjectDeliveryService service;

    private final Workspace workspace = Workspace.builder().id(4L).slug("acme").build();
    private final Project project = Project.builder().id(12L).identifier("WEB").workspace(workspace).build();
    private final Issue issue = Issue.builder().id(55L).sequenceNumber(4).title("Fix the footer").project(project).build();

    @BeforeEach
    void setUp() {
        lenient().when(access.resolveAndAuthorize("acme", 7L)).thenReturn(workspace);
        lenient().when(projectRepository.findByIdAndWorkspaceId(12L, 4L)).thenReturn(Optional.of(project));
        lenient().when(deliveryService.toResponse(any(DeliveryRun.class))).thenAnswer(call -> response(call.getArgument(0)));
    }

    private static DeliveryRunResponse response(DeliveryRun run) {
        return new DeliveryRunResponse(run.getId(), 55L, "WEB-4", "Fix the footer", 12L, "Website", "claude-code", null,
            run.getStatus().name(), null, run.getResultUrl(), null, false, 7L, null, null);
    }

    private DeliveryRun run(long id, DeliveryRunStatus status) {
        return DeliveryRun.builder().id(id).issue(issue).providerKey("claude-code").status(status).build();
    }

    private static DeliveryRunEvent event(DeliveryRun run, int seq, String kind, String tool) {
        DeliveryRunEvent event = DeliveryRunEvent.builder().run(run).seq(seq).kind(kind).tool(tool).text("...").build();
        ReflectionTestUtils.setField(event, "createdAt", LocalDateTime.of(2026, 11, 13, 10, seq));
        return event;
    }

    private static DeliveryRunRepository.FollowUpRow followUp(long parent, long run) {
        return new DeliveryRunRepository.FollowUpRow() {
            @Override public Long getParentId() { return parent; }
            @Override public Long getRunId() { return run; }
        };
    }

    private static DeliveryRunActivityResponse.Approval pending(long id, boolean canDecide) {
        return new DeliveryRunActivityResponse.Approval(id, "Bash", "npm install lodash", "PENDING", null, null, null, null,
            canDecide, "agent", "shell", null, null, null);
    }

    @Test
    @DisplayName("une page : chaque mission avec son étape en cours, ses liens et ses demandes ouvertes")
    void a_page_reads_each_mission_with_its_step_links_and_requests() {
        DeliveryRun working = run(100L, DeliveryRunStatus.RUNNING);
        DeliveryRun reviewed = run(90L, DeliveryRunStatus.DONE);
        reviewed.setBranch("tf/web-4");
        reviewed.setResultUrl("https://github.com/acme/website/pull/212");
        working.setParentRun(reviewed);
        DeliveryRun commented = run(80L, DeliveryRunStatus.DONE);
        commented.setResultUrl("https://taskforce.example/issues/55#comment-3");
        when(runRepository.findByProjectId(eq(12L), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(working, reviewed, commented), PageRequest.of(0, 20), 3));
        when(eventRepository.findLastByRunIds(List.of(100L, 90L, 80L))).thenReturn(List.of(event(working, 12, "tool", "Edit")));
        when(runRepository.findFollowUps(List.of(100L, 90L, 80L))).thenReturn(List.of(followUp(90L, 95L), followUp(90L, 100L)));
        when(activityService.pendingApprovals(List.of(working, reviewed, commented), 7L)).thenReturn(Map.of(100L, List.of(pending(9L, true))));

        PageResponse<ProjectRunResponse> page = service.listRuns("acme", 12L, 0, 20, 7L);

        assertThat(page.getTotalElements()).isEqualTo(3);
        assertThat(page.getContent()).extracting(row -> row.run().id()).containsExactly(100L, 90L, 80L);
        ProjectRunResponse first = page.getContent().get(0);
        assertThat(first.step()).isEqualTo(new ProjectRunResponse.Step(12, "tool", "Edit", LocalDateTime.of(2026, 11, 13, 10, 12)));
        assertThat(first.links()).isEqualTo(new ProjectRunResponse.Links(null, null, 90L, null));
        assertThat(first.approvals()).extracting(DeliveryRunActivityResponse.Approval::canDecide).containsExactly(true);
        // La mission reprise : sa branche, sa pull request, et la dernière mission qui la reprend.
        ProjectRunResponse second = page.getContent().get(1);
        assertThat(second.step()).isNull();
        assertThat(second.links()).isEqualTo(new ProjectRunResponse.Links("tf/web-4", "https://github.com/acme/website/pull/212", null, 100L));
        assertThat(second.approvals()).isEmpty();
        // Un résultat qui n'est pas une pull request n'en devient pas une.
        assertThat(page.getContent().get(2).links().pullRequestUrl()).isNull();
    }

    @ParameterizedTest(name = "page {0}, taille {1} : page {2} de {3}")
    @CsvSource({
        "0,   20,  0,  20",
        "2,   50,  2,  50",
        "-1,  500, 0,  50",
        "3,   0,   3,  1",
    })
    @DisplayName("la page est bornée : 50 missions au plus, jamais une page négative")
    void the_page_is_bounded(int page, int size, int expectedPage, int expectedSize) {
        when(runRepository.findByProjectId(eq(12L), any(Pageable.class))).thenAnswer(call -> new PageImpl<DeliveryRun>(List.of(), call.getArgument(1), 0));

        PageResponse<ProjectRunResponse> read = service.listRuns("acme", 12L, page, size, 7L);

        ArgumentCaptor<Pageable> asked = ArgumentCaptor.forClass(Pageable.class);
        verify(runRepository).findByProjectId(eq(12L), asked.capture());
        assertThat(asked.getValue().getPageNumber()).isEqualTo(expectedPage);
        assertThat(asked.getValue().getPageSize()).isEqualTo(expectedSize);
        assertThat(read.getContent()).isEmpty();
        // Une page vide ne lit ni étapes, ni reprises, ni demandes.
        verifyNoInteractions(eventRepository, activityService);
    }

    @Test
    @DisplayName("🔒 hors de l'espace : refusé, rien n'est lu")
    void someone_outside_the_workspace_reads_nothing() {
        when(access.resolveAndAuthorize("acme", 8L)).thenThrow(new ForbiddenException("Access denied: you're not a member of this workspace"));

        assertThatThrownBy(() -> service.listRuns("acme", 12L, 0, 20, 8L)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.run("acme", 12L, 100L, 8L)).isInstanceOf(ForbiddenException.class);
        verify(runRepository, never()).findByProjectId(anyLong(), any());
        verify(runRepository, never()).findInProject(anyLong(), anyLong());
    }

    @Test
    @DisplayName("🔒 un projet d'un autre espace répond comme un projet inexistant")
    void a_project_of_another_workspace_is_not_found() {
        when(projectRepository.findByIdAndWorkspaceId(13L, 4L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.listRuns("acme", 13L, 0, 20, 7L))
            .isInstanceOf(ResourceNotFoundException.class).hasMessage("Project not found");
        verify(runRepository, never()).findByProjectId(anyLong(), any());
    }

    @Test
    @DisplayName("🔒 un projet privé que la personne ne voit pas : 404, avant toute lecture de ses missions")
    void a_private_project_one_cannot_see_is_not_found() {
        doThrow(new ResourceNotFoundException("Project not found")).when(visibilityGuard).assertCanView(project, 8L);
        when(access.resolveAndAuthorize("acme", 8L)).thenReturn(workspace);

        assertThatThrownBy(() -> service.listRuns("acme", 12L, 0, 20, 8L)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.run("acme", 12L, 100L, 8L)).isInstanceOf(ResourceNotFoundException.class);
        verify(runRepository, never()).findByProjectId(anyLong(), any());
        verify(runRepository, never()).findInProject(anyLong(), anyLong());
    }

    @Test
    @DisplayName("une mission du projet, comme une ligne de la page ; celle d'un autre projet n'existe pas ici")
    void one_mission_reads_like_a_row_of_the_page() {
        DeliveryRun working = run(100L, DeliveryRunStatus.RUNNING);
        when(runRepository.findInProject(100L, 12L)).thenReturn(Optional.of(working));
        when(eventRepository.findLastByRunIds(List.of(100L))).thenReturn(List.of(event(working, 3, "test", null)));
        when(runRepository.findFollowUps(List.of(100L))).thenReturn(List.of());
        when(activityService.pendingApprovals(List.of(working), 7L)).thenReturn(Map.of(100L, List.of(pending(9L, false))));

        ProjectRunResponse row = service.run("acme", 12L, 100L, 7L);

        assertThat(row.run().id()).isEqualTo(100L);
        assertThat(row.step().kind()).isEqualTo("test");
        assertThat(row.approvals()).extracting(DeliveryRunActivityResponse.Approval::canDecide).containsExactly(false);

        when(runRepository.findInProject(200L, 12L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.run("acme", 12L, 200L, 7L))
            .isInstanceOf(ResourceNotFoundException.class).hasMessage("Run not found");
    }

    @Test
    @DisplayName("une lecture fait avancer les missions en attente ou en cours, pas celles qui sont finies")
    void reading_advances_missions_in_flight_only() {
        List<ProjectRunResponse> rows = List.of(
            row(1L, "QUEUED"), row(2L, "RUNNING"), row(3L, "DONE"), row(4L, "FAILED"));

        assertThat(ProjectDeliveryService.toAdvance(rows)).containsExactly(1L, 2L);
    }

    @Test
    @DisplayName("seule une pull request de GitHub est une pull request")
    void only_a_github_pull_request_is_one() {
        assertThat(ProjectDeliveryService.pullRequestUrl("https://github.com/acme/website/pull/212")).isNotNull();
        assertThat(ProjectDeliveryService.pullRequestUrl("https://github.com/acme/website/pull/212/files")).isNotNull();
        assertThat(ProjectDeliveryService.pullRequestUrl("https://github.com/acme/website/issues/212")).isNull();
        assertThat(ProjectDeliveryService.pullRequestUrl(null)).isNull();
    }

    private static ProjectRunResponse row(long id, String status) {
        DeliveryRunResponse run = new DeliveryRunResponse(id, 55L, "WEB-4", "Fix the footer", 12L, "Website", "claude-code",
            null, status, null, null, null, false, 7L, null, null);
        return new ProjectRunResponse(run, null, new ProjectRunResponse.Links(null, null, null, null), List.of());
    }
}
