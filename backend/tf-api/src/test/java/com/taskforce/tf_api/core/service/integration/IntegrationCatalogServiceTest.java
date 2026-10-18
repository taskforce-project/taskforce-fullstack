package com.taskforce.tf_api.core.service.integration;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.ConnectorView;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService.ConnectedServer;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.Mockito.when;

/** Tests unitaires de {@link IntegrationCatalogService} : état de connexion réel des natives et des préréglages. */
@ExtendWith(MockitoExtension.class)
@DisplayName("IntegrationCatalogService")
class IntegrationCatalogServiceTest {

    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private IntegrationRepository integrationRepository;
    @Mock private WorkspaceMcpService workspaceMcp;

    private IntegrationCatalogService service;

    @BeforeEach
    void setUp() {
        ConnectorCatalog catalog = new ConnectorCatalog();
        catalog.build();
        service = new IntegrationCatalogService(catalog, workspaceRepository, workspaceMemberRepository,
            integrationRepository, workspaceMcp);
        when(workspaceRepository.findBySlug("acme")).thenReturn(Optional.of(Workspace.builder().id(1L).slug("acme").build()));
    }

    @Test
    @DisplayName("hors du workspace → 403")
    void refuses_a_non_member() {
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(false);

        assertThatThrownBy(() -> service.getCatalog("acme", 7L)).isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("native connectée par son flux, préréglage connecté par son serveur MCP ; une clé hors préréglage ne compte pas")
    void reports_the_real_connection_state() {
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(true);
        when(integrationRepository.findByWorkspaceId(1L))
            .thenReturn(List.of(Integration.builder().provider(IntegrationProvider.GITHUB).build()));
        // « github » enregistré comme serveur MCP ne doit pas se faire passer pour la native.
        when(workspaceMcp.connectedServers(1L)).thenReturn(List.of(
            new ConnectedServer("linear", null, "https://mcp.linear.app/mcp"),
            new ConnectedServer("slack", null, "https://example.com/mcp")));

        IntegrationCatalogResponse catalog = service.getCatalog("acme", 7L);

        List<ConnectorView> tools = catalog.categories().stream().flatMap(g -> g.tools().stream()).toList();
        assertThat(tools).filteredOn(ConnectorView::connected).extracting(ConnectorView::key)
            .containsExactlyInAnyOrder("github", "linear");
        assertThat(catalog.connected()).isEqualTo(2);
        assertThat(catalog.total()).isEqualTo(28).isEqualTo(tools.size());
    }

    @Test
    @DisplayName("serveurs hors catalogue listés en dernier, connectés, avec leur nom et l'hôte de leur URL")
    void lists_custom_servers_last() {
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(true);
        when(integrationRepository.findByWorkspaceId(1L)).thenReturn(List.of());
        // « trello » : connexion MCP héritée d'une tuile retirée au lot 6, sans nom enregistré.
        when(workspaceMcp.connectedServers(1L)).thenReturn(List.of(
            new ConnectedServer("custom-team-docs", "Team docs", "https://docs.example.com/mcp"),
            new ConnectedServer("trello", null, "https://mcp.trello.example/sse")));

        IntegrationCatalogResponse catalog = service.getCatalog("acme", 7L);

        var last = catalog.categories().get(catalog.categories().size() - 1);
        assertThat(last.category()).isEqualTo("CUSTOM_MCP");
        assertThat(last.label()).isEqualTo("Your MCP servers");
        assertThat(last.tools()).extracting(ConnectorView::key, ConnectorView::name, ConnectorView::description)
            .containsExactly(
                tuple("custom-team-docs", "Team docs", "docs.example.com"),
                tuple("trello", "trello", "mcp.trello.example"));
        assertThat(last.tools()).allSatisfy(t -> {
            assertThat(t.connected()).isTrue();
            assertThat(t.authType()).isEqualTo("MCP");
            assertThat(t.mcpSuggestedUrl()).isNull();
        });
        assertThat(catalog.total()).isEqualTo(30);
        assertThat(catalog.connected()).isEqualTo(2);
    }

    @Test
    @DisplayName("groupes dans l'ordre du catalogue, Plane en tête")
    void groups_in_declaration_order() {
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(true);
        when(integrationRepository.findByWorkspaceId(1L)).thenReturn(List.of());
        when(workspaceMcp.connectedServers(1L)).thenReturn(List.of());

        IntegrationCatalogResponse catalog = service.getCatalog("acme", 7L);

        assertThat(catalog.categories().get(0).category()).isEqualTo("PROJECT_MANAGEMENT");
        assertThat(catalog.categories().get(0).label()).isEqualTo("Project management");
        assertThat(catalog.categories().get(0).tools().get(0).key()).isEqualTo("plane");
        assertThat(catalog.connected()).isZero();
    }
}
