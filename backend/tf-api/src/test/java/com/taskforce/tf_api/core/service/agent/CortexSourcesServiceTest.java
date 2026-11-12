package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.CortexSourcesResponse;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.enums.NodeStatus;
import com.taskforce.tf_api.core.enums.NodeType;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.IssueCommentRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainViewer;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Ce que Cortex peut lire dans un espace (R125) : chaque source comptée et datée, avec les droits de ses lectures. Un
 * projet privé que la personne ne voit pas ne compte pas, ni ses issues, ni ses commentaires, ni ses notes.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Les sources de Cortex dans un espace")
class CortexSourcesServiceTest {

    private static final LocalDateTime NOV_1 = LocalDateTime.of(2026, 11, 1, 9, 0);

    @Mock private BrainAccessGuard access;
    @Mock private ProjectRepository projects;
    @Mock private IssueRepository issues;
    @Mock private IssueCommentRepository comments;
    @Mock private KnowledgeNodeRepository nodes;
    @Mock private IntegrationRepository integrations;
    @Mock private ConnectorConnectionRepository connections;
    @Mock private WorkspaceMcpService mcp;

    @InjectMocks private CortexSourcesService service;

    /** Une ligne par projet, telle que les dépôts la rendent. */
    private record Count(Long getProjectId, Long getTotal, LocalDateTime getChangedAt) implements IssueRepository.ProjectCount {
    }

    /** Une note, sans son contenu. */
    private record Node(Long getId, NodeType getType, LocalDateTime getUpdatedAt) implements KnowledgeNodeRepository.SourceRow {
    }

    @BeforeEach
    void workspace() {
        lenient().when(access.resolveAndAuthorize("acme", 7L)).thenReturn(Workspace.builder().id(1L).slug("acme").build());
        // Trois projets : le 3 est privé, et la personne qui n'est pas admin ne voit que le 1 et le 2.
        lenient().when(projects.findByWorkspaceIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
            Project.builder().id(3L).updatedAt(NOV_1.plusDays(6)).build(),
            Project.builder().id(2L).updatedAt(NOV_1.plusDays(2)).build(),
            Project.builder().id(1L).updatedAt(NOV_1).build()));
        lenient().when(issues.countByProject(1L)).thenReturn(List.of(
            new Count(1L, 12L, NOV_1.plusDays(4)), new Count(2L, 3L, NOV_1.plusDays(1)), new Count(3L, 40L, NOV_1.plusDays(7))));
        lenient().when(comments.countByProject(1L)).thenReturn(List.of(
            new Count(1L, 30L, NOV_1.plusDays(5)), new Count(3L, 9L, NOV_1.plusDays(7))));
        lenient().when(nodes.findSourceRowsByWorkspaceIdAndStatus(1L, NodeStatus.ACTIVE)).thenReturn(List.of(
            new Node(10L, NodeType.NOTE, NOV_1.plusDays(3)), new Node(11L, NodeType.NOTE, NOV_1.plusDays(7)),
            new Node(12L, NodeType.README, NOV_1), new Node(13L, NodeType.DECISION, NOV_1.plusDays(2))));
        Integration github = Integration.builder().provider(IntegrationProvider.GITHUB).connectedAt(NOV_1.minusDays(9)).build();
        lenient().when(integrations.findByWorkspaceId(1L)).thenReturn(List.of(github));
        lenient().when(mcp.connectedServers(1L, 7L)).thenReturn(List.of(
            new WorkspaceMcpService.ConnectedServer("linear", null, "https://mcp.linear.app/mcp")));
        ConnectorConnection linear = mock(ConnectorConnection.class);
        lenient().when(linear.getConnectorKey()).thenReturn("linear");
        lenient().when(linear.getUpdatedAt()).thenReturn(NOV_1.minusDays(2));
        ConnectorConnection apiKeyOnly = mock(ConnectorConnection.class);
        lenient().when(apiKeyOnly.getConnectorKey()).thenReturn("notion");
        lenient().when(connections.findUsable(1L, 7L)).thenReturn(List.of(linear, apiKeyOnly));
    }

    private static CortexSourcesResponse.Source source(CortexSourcesResponse response, String key) {
        return response.sources().stream().filter(s -> s.key().equals(key)).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("un propriétaire ou un admin : chaque source de l'espace, comptée, avec son dernier changement")
    void anAdminReadsEverything() {
        when(access.viewer(1L, 7L)).thenReturn(BrainViewer.seeingAll(1L));
        when(access.hiddenNodeIds(any())).thenReturn(Set.of());

        CortexSourcesResponse response = service.sources("acme", 7L);

        assertThat(response.sources())
            .extracting(CortexSourcesResponse.Source::key, CortexSourcesResponse.Source::count,
                CortexSourcesResponse.Source::changedAt)
            .containsExactly(
                tuple("projects", 3L, NOV_1.plusDays(6)),
                tuple("issues", 55L, NOV_1.plusDays(7)),
                tuple("comments", 39L, NOV_1.plusDays(7)),
                tuple("notes", 2L, NOV_1.plusDays(7)),
                tuple("documents", 2L, NOV_1.plusDays(2)),
                // GitHub en natif, Linear par son serveur MCP ; une connexion sans serveur ne compte pas.
                tuple("connectors", 2L, NOV_1.minusDays(2)));
    }

    @Test
    @DisplayName("un membre : seulement les projets qu'il voit, ce qu'ils portent, et les notes qu'il lit")
    void aMemberReadsWhatHeSees() {
        BrainViewer viewer = BrainViewer.seeing(1L, List.of(1L, 2L));
        when(access.viewer(1L, 7L)).thenReturn(viewer);
        when(access.hiddenNodeIds(viewer)).thenReturn(Set.of(11L));

        CortexSourcesResponse response = service.sources("acme", 7L);

        assertThat(source(response, "projects").count()).isEqualTo(2L);
        assertThat(source(response, "projects").changedAt()).isEqualTo(NOV_1.plusDays(2));
        assertThat(source(response, "issues").count()).isEqualTo(15L);
        assertThat(source(response, "issues").changedAt()).isEqualTo(NOV_1.plusDays(4));
        assertThat(source(response, "comments").count()).isEqualTo(30L);
        assertThat(source(response, "notes").count()).isEqualTo(1L);
        assertThat(source(response, "notes").changedAt()).isEqualTo(NOV_1.plusDays(3));
    }

    @Test
    @DisplayName("un espace neuf : zéro partout, et aucune date")
    void anEmptyWorkspace() {
        when(access.viewer(1L, 7L)).thenReturn(BrainViewer.seeingAll(1L));
        when(access.hiddenNodeIds(any())).thenReturn(Set.of());
        when(projects.findByWorkspaceIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());
        when(issues.countByProject(1L)).thenReturn(List.of());
        when(comments.countByProject(1L)).thenReturn(List.of());
        when(nodes.findSourceRowsByWorkspaceIdAndStatus(1L, NodeStatus.ACTIVE)).thenReturn(List.of());
        when(integrations.findByWorkspaceId(1L)).thenReturn(List.of());
        when(mcp.connectedServers(1L, 7L)).thenReturn(List.of());
        when(connections.findUsable(1L, 7L)).thenReturn(List.of());

        CortexSourcesResponse response = service.sources("acme", 7L);

        assertThat(response.sources()).hasSize(6).allSatisfy(s -> {
            assertThat(s.count()).isZero();
            assertThat(s.changedAt()).isNull();
        });
    }

    @Test
    @DisplayName("hors de l'espace : refusé, rien n'est lu")
    void aStrangerReadsNothing() {
        when(access.resolveAndAuthorize("other", 7L)).thenThrow(new ForbiddenException("Access denied"));

        assertThatThrownBy(() -> service.sources("other", 7L)).isInstanceOf(ForbiddenException.class);
        verify(projects, never()).findByWorkspaceIdOrderByCreatedAtDesc(any());
    }
}
