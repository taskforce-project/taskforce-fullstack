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
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.CategoryGroup;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.ConnectorView;
import com.taskforce.tf_api.core.enums.ConnectionScope;
import com.taskforce.tf_api.core.enums.ConnectionState;
import com.taskforce.tf_api.core.enums.ConnectorCategory;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.ConnectorApp;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.mcp.McpOAuthSettings;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService.ConnectedServer;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires de {@link IntegrationCatalogService} : l'état réel de la connexion que la personne utilise (la sienne,
 * sinon celle de l'espace), les catégories du registre dans leur ordre, et chaque outil du catalogue montré à tous,
 * essayé ou non (décision de la Présidence, 12/11/2026).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("IntegrationCatalogService")
class IntegrationCatalogServiceTest {

    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private IntegrationRepository integrationRepository;
    @Mock private WorkspaceMcpService workspaceMcp;
    @Mock private ConnectorAppRepository connectorApps;

    private ConnectorCatalog catalog;
    private IntegrationCatalogService service;

    @BeforeEach
    void setUp() {
        catalog = new ConnectorCatalog();
        catalog.build();
        McpOAuthSettings settings = new McpOAuthSettings("https://api.example.test", "", "https://app.example.test",
            "TaskForce", "web", "");
        service = new IntegrationCatalogService(catalog, workspaceRepository, workspaceMemberRepository,
            integrationRepository, workspaceMcp, connectorApps, settings);
        when(workspaceRepository.findBySlug("acme")).thenReturn(Optional.of(Workspace.builder().id(1L).slug("acme").build()));
        lenient().when(connectorApps.findByWorkspaceId(1L)).thenReturn(List.of());
    }

    private static ConnectedServer server(String key, ConnectionScope scope, ConnectionState state, String account) {
        return new ConnectedServer(key, null, "https://example.test/mcp", scope, state, account);
    }

    private static List<ConnectorView> tools(IntegrationCatalogResponse catalog) {
        return catalog.categories().stream().flatMap(g -> g.tools().stream()).toList();
    }

    @Test
    @DisplayName("hors du workspace -> 403")
    void refuses_a_non_member() {
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(false);

        assertThatThrownBy(() -> service.getCatalog("acme", 7L)).isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("native connectée par son flux, préréglage par la connexion de la personne ; une clé hors préréglage ne compte pas")
    void reports_the_real_connection_state() {
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(true);
        when(integrationRepository.findByWorkspaceId(1L))
            .thenReturn(List.of(Integration.builder().provider(IntegrationProvider.GITHUB).build()));
        // « slack » enregistré comme serveur MCP ne doit pas se faire passer pour la native.
        when(workspaceMcp.connectedServers(1L, 7L)).thenReturn(List.of(
            server("linear", ConnectionScope.PERSONAL, ConnectionState.CONNECTED, "ada@acme.test"),
            new ConnectedServer("slack", null, "https://example.com/mcp")));

        IntegrationCatalogResponse catalog = service.getCatalog("acme", 7L);

        assertThat(tools(catalog)).filteredOn(ConnectorView::connected).extracting(ConnectorView::key)
            .containsExactlyInAnyOrder("github", "linear");
        ConnectorView linear = tools(catalog).stream().filter(t -> t.key().equals("linear")).findFirst().orElseThrow();
        assertThat(linear.state()).isEqualTo("CONNECTED");
        assertThat(linear.accountLabel()).isEqualTo("ada@acme.test");
        assertThat(linear.scope()).isEqualTo("PERSONAL");
        assertThat(linear.connection()).isEqualTo("self-registration");
        assertThat(linear.writeChoice()).isTrue();
        assertThat(catalog.connected()).isEqualTo(2);
        assertThat(catalog.total()).isEqualTo(this.catalog.all().size()).isEqualTo(tools(catalog).size());
    }

    @Test
    @DisplayName("sa connexion passe avant celle de l'espace ; à reconnecter se dit, sans compter comme branché")
    void her_own_connection_and_its_state() {
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(true);
        when(integrationRepository.findByWorkspaceId(1L)).thenReturn(List.of());
        when(workspaceMcp.connectedServers(1L, 7L)).thenReturn(List.of(
            server("linear", ConnectionScope.WORKSPACE, ConnectionState.CONNECTED, "team@acme.test"),
            server("linear", ConnectionScope.PERSONAL, ConnectionState.NEEDS_RECONNECT, "ada@acme.test")));

        ConnectorView linear = tools(service.getCatalog("acme", 7L)).stream()
            .filter(t -> t.key().equals("linear")).findFirst().orElseThrow();

        assertThat(linear.scope()).isEqualTo("PERSONAL");
        assertThat(linear.state()).isEqualTo("NEEDS_RECONNECT");
        assertThat(linear.connected()).isFalse();
    }

    @Test
    @DisplayName("rien de connecté : chaque outil du catalogue, essayé ou non, dans l'ordre du registre")
    void shows_every_tool_of_the_catalog() {
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(true);
        when(integrationRepository.findByWorkspaceId(1L)).thenReturn(List.of());
        when(workspaceMcp.connectedServers(1L, 7L)).thenReturn(List.of());

        IntegrationCatalogResponse catalog = service.getCatalog("acme", 7L);

        assertThat(tools(catalog)).extracting(ConnectorView::key)
            .contains("plane", "linear", "slack", "github", "jira", "cloudflare", "stripe", "asana")
            .doesNotHaveDuplicates();
        assertThat(catalog.categories()).extracting(CategoryGroup::category, CategoryGroup::label)
            .contains(tuple("KNOWLEDGE", "Knowledge"), tuple("TICKETS_PROJECTS", "Tickets and projects"),
                tuple("CHAT_MAIL", "Chat and mail"), tuple("CODE", "Code"));
        assertThat(catalog.categories()).extracting(g -> ConnectorCategory.valueOf(g.category()).ordinal()).isSorted();
        assertThat(catalog.total()).isEqualTo(this.catalog.all().size());
        assertThat(catalog.connected()).isZero();
    }

    @Test
    @DisplayName("un préréglage pas encore essayé se montre et se dit connecté comme les autres")
    void an_untried_preset_she_connected() {
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(true);
        when(integrationRepository.findByWorkspaceId(1L)).thenReturn(List.of());
        when(workspaceMcp.connectedServers(1L, 7L)).thenReturn(List.of(
            new ConnectedServer("cloudflare", null, "https://mcp.cloudflare.com/mcp")));

        IntegrationCatalogResponse catalog = service.getCatalog("acme", 7L);

        ConnectorView cloudflare = tools(catalog).stream().filter(t -> t.key().equals("cloudflare")).findFirst().orElseThrow();
        assertThat(cloudflare.connected()).isTrue();
        assertThat(cloudflare.category()).isEqualTo("CODE");
        assertThat(cloudflare.scope()).isEqualTo("WORKSPACE");
        assertThat(cloudflare.tried()).isFalse();
        assertThat(catalog.total()).isEqualTo(this.catalog.all().size());
        assertThat(catalog.connected()).isEqualTo(1);
    }

    @Test
    @DisplayName("les préréglages pas encore essayés se montrent, avec le chemin qu'ils demandent")
    void the_untried_presets_show_their_path() {
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(true);
        when(integrationRepository.findByWorkspaceId(1L)).thenReturn(List.of());
        when(workspaceMcp.connectedServers(1L, 7L)).thenReturn(List.of());
        when(connectorApps.findByWorkspaceId(1L)).thenReturn(List.of(ConnectorApp.builder().connectorKey("asana").build()));

        List<ConnectorView> tools = tools(service.getCatalog("acme", 7L));

        ConnectorView slack = tools.stream().filter(t -> t.key().equals("slack-mcp")).findFirst().orElseThrow();
        assertThat(slack.state()).isEqualTo("WAITING_FOR_ADMIN");
        assertThat(slack.admin().required()).isTrue();
        assertThat(slack.admin().text()).contains("https://api.example.test/api/mcp/oauth/callback");
        ConnectorView asana = tools.stream().filter(t -> t.key().equals("asana")).findFirst().orElseThrow();
        assertThat(asana.companyApp()).isTrue();
        assertThat(asana.state()).isEqualTo("NOT_CONNECTED");
        ConnectorView jira = tools.stream().filter(t -> t.key().equals("jira")).findFirst().orElseThrow();
        assertThat(jira.admin().text()).contains("https://api.example.test/**").doesNotContain("{redirectHost}");
        ConnectorView figma = tools.stream().filter(t -> t.key().equals("figma")).findFirst().orElseThrow();
        assertThat(figma.blocked()).contains("waitlist");
        ConnectorView stripe = tools.stream().filter(t -> t.key().equals("stripe")).findFirst().orElseThrow();
        assertThat(stripe.apiKey().link()).startsWith("https://");
        assertThat(stripe.category()).isEqualTo("FINANCE_HR");
    }

    @Test
    @DisplayName("serveurs hors catalogue listés en dernier, avec leur nom et l'hôte de leur URL")
    void lists_custom_servers_last() {
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(true);
        when(integrationRepository.findByWorkspaceId(1L)).thenReturn(List.of());
        // « trello » : connexion MCP héritée d'une tuile retirée au lot 6, sans nom enregistré.
        when(workspaceMcp.connectedServers(1L, 7L)).thenReturn(List.of(
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
        assertThat(catalog.total()).isEqualTo(this.catalog.all().size() + 2);
        assertThat(catalog.connected()).isEqualTo(2);
    }
}
