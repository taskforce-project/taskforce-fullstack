package com.taskforce.tf_api.core.service.mcp;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import org.mockito.ArgumentCaptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link WorkspaceMcpService} : gating par plan, découverte + namespacing, cache
 * TTL, exécution (approbation), dégradation gracieuse.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("WorkspaceMcpService")
class WorkspaceMcpServiceTest {

    @Mock private ConnectorConnectionRepository repository;
    @Mock private McpClient client;
    @Mock private McpTokenService tokenService; // OAuth (TF-MCP-02) : non-OAuth par défaut en test (isOAuth=false)

    private final ObjectMapper objectMapper = new ObjectMapper();
    private WorkspaceMcpService service;

    private final AgentContext ctx = new AgentContext("acme", 1L, 7L);
    private final McpClient.Session session = new McpClient.Session("http://x/mcp", "sid", null);

    @BeforeEach
    void setup() {
        service = new WorkspaceMcpService(repository, client, objectMapper, tokenService);
        ReflectionTestUtils.setField(service, "cacheTtlMs", 60_000L);
    }

    private ConnectorConnection mcpConnector() {
        return ConnectorConnection.builder()
            .connectorKey("linear").config("{\"mcpUrl\":\"http://x/mcp\"}").build();
    }

    private McpClient.ToolDef def(String name) throws Exception {
        return new McpClient.ToolDef(name, "desc " + name, objectMapper.readTree("{\"type\":\"object\"}"), false);
    }

    @Test
    @DisplayName("découvre les outils d'un serveur MCP et les namespace <connecteur>__<outil>")
    void discovers_and_namespaces() throws Exception {
        when(repository.findByWorkspaceId(1L)).thenReturn(List.of(mcpConnector()));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(def("create_issue")));

        List<AgentTool> tools = service.toolsFor(ctx);

        assertThat(tools).hasSize(1);
        assertThat(tools.get(0).name()).isEqualTo("linear__create_issue");
    }

    @Test
    @DisplayName("ignore les connecteurs sans mcpUrl (ne sont pas des serveurs MCP)")
    void skips_non_mcp_connectors() {
        ConnectorConnection plain = ConnectorConnection.builder()
            .connectorKey("stripe").config("{\"apiKey\":\"sk_test\"}").build();
        when(repository.findByWorkspaceId(1L)).thenReturn(List.of(plain));

        assertThat(service.toolsFor(ctx)).isEmpty();
        verify(client, never()).initialize(any());
    }

    @Test
    @DisplayName("connectedServers : les connecteurs portant un mcpUrl, sans aucun appel réseau")
    void connected_servers_lists_mcp_rows_only() {
        ConnectorConnection plain = ConnectorConnection.builder()
            .connectorKey("stripe").config("{\"apiKey\":\"sk_test\"}").build();
        when(repository.findByWorkspaceId(1L)).thenReturn(List.of(mcpConnector(), plain));

        assertThat(service.connectedServers(1L))
            .containsExactly(new WorkspaceMcpService.ConnectedServer("linear", "http://x/mcp"));
        verify(client, never()).initialize(any());
    }

    @Test
    @DisplayName("cache TTL : deux appels → un seul handshake serveur")
    void caches_within_ttl() throws Exception {
        when(repository.findByWorkspaceId(1L)).thenReturn(List.of(mcpConnector()));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(def("create_issue")));

        service.toolsFor(ctx);
        service.toolsFor(ctx);

        verify(client, times(1)).initialize(any());
    }

    @Test
    @DisplayName("execute() rouvre une session et appelle l'outil par son nom d'origine (non namespacé)")
    void execute_delegates_with_original_name() throws Exception {
        when(repository.findByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(Optional.of(mcpConnector()));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(def("create_issue")));
        when(client.callTool(eq(session), eq("create_issue"), any())).thenReturn("DONE");

        String result = service.execute(1L, "linear__create_issue", Map.of("title", "Bug"), true);

        assertThat(result).isEqualTo("DONE");
        verify(client).callTool(eq(session), eq("create_issue"), any());
    }

    @Test
    @DisplayName("execute() retrouve un outil par le nom assaini qu'en voit Cortex, et l'appelle par son nom d'origine")
    void execute_resolves_the_name_exposed_to_cortex() throws Exception {
        ConnectorConnection conn = ConnectorConnection.builder().connectorKey("linear")
            .config("{\"mcpUrl\":\"http://x/mcp\",\"mcpAllow\":\"issues.create\"}").build();
        when(repository.findByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(Optional.of(conn));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(def("issues.list"), def("issues.create")));
        when(client.callTool(eq(session), eq("issues.create"), any())).thenReturn("DONE");

        // Le point n'est pas admis dans un nom d'outil côté modèle : Cortex propose « linear__issues_create ».
        assertThat(service.execute(1L, "linear__issues_create", Map.of(), true)).isEqualTo("DONE");
        verify(client).callTool(eq(session), eq("issues.create"), any());
    }

    @Test
    @DisplayName("execute() refuse une écriture à un simple membre, sans appeler l'outil (OSS-1.5)")
    void execute_refuses_write_without_manager_role() throws Exception {
        when(repository.findByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(Optional.of(mcpConnector()));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(def("create_issue")));

        assertThatThrownBy(() -> service.execute(1L, "linear__create_issue", Map.of("title", "Bug"), false))
            .isInstanceOf(ForbiddenException.class);
        verify(client, never()).callTool(any(), any(), any());
        verify(client).close(session);
    }

    @Test
    @DisplayName("execute() laisse un simple membre lancer un outil en lecture seule")
    void execute_allows_read_only_for_member() throws Exception {
        when(repository.findByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(Optional.of(mcpConnector()));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(
            new McpClient.ToolDef("list_issues", "lecture", objectMapper.readTree("{\"type\":\"object\"}"), true)));
        when(client.callTool(eq(session), eq("list_issues"), any())).thenReturn("[]");

        assertThat(service.execute(1L, "linear__list_issues", Map.of(), false)).isEqualTo("[]");
    }

    @Test
    @DisplayName("execute() refuse un outil hors de l'allow-list du connecteur, sans ouvrir de session")
    void execute_refuses_tool_outside_allow_list() {
        ConnectorConnection conn = ConnectorConnection.builder().connectorKey("linear")
            .config("{\"mcpUrl\":\"http://x/mcp\",\"mcpAllow\":\"list_issues\"}").build();
        when(repository.findByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(Optional.of(conn));

        assertThatThrownBy(() -> service.execute(1L, "linear__delete_issue", Map.of(), true))
            .isInstanceOf(ForbiddenException.class);
        verify(client, never()).initialize(any());
    }

    @Test
    @DisplayName("execute() n'exécute jamais un outil désactivé qui porte le même nom assaini qu'un outil autorisé")
    void execute_never_picks_a_disabled_lookalike() throws Exception {
        // Seul « issues.create » est activé : Cortex le voit sous « linear__issues_create », nom que porte aussi
        // l'outil désactivé « issues_create ».
        ConnectorConnection conn = ConnectorConnection.builder().connectorKey("linear")
            .config("{\"mcpUrl\":\"http://x/mcp\",\"mcpAllow\":\"issues.create\"}").build();
        when(repository.findByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(Optional.of(conn));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(def("issues_create"), def("issues.create")));
        when(client.callTool(eq(session), eq("issues.create"), any())).thenReturn("DONE");

        assertThat(service.execute(1L, "linear__issues_create", Map.of(), true)).isEqualTo("DONE");
        verify(client, never()).callTool(any(), eq("issues_create"), any());
    }

    @Test
    @DisplayName("execute() signale un outil inconnu du serveur")
    void execute_unknown_tool() throws Exception {
        when(repository.findByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(Optional.of(mcpConnector()));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(def("create_issue")));

        assertThatThrownBy(() -> service.execute(1L, "linear__missing", Map.of(), true))
            .isInstanceOf(ResourceNotFoundException.class);
        verify(client, never()).callTool(any(), any(), any());
    }

    @Test
    @DisplayName("serveur MCP en échec → ignoré, liste vide (n'interrompt pas l'agent)")
    void failing_server_is_skipped() {
        when(repository.findByWorkspaceId(1L)).thenReturn(List.of(mcpConnector()));
        when(client.initialize(any())).thenThrow(new BusinessException("down"));

        assertThat(service.toolsFor(ctx)).isEmpty();
    }

    @Test
    @DisplayName("allow-list (mcpAllow) : seuls les outils autorisés sont exposés")
    void allow_list_filters_tools() throws Exception {
        ConnectorConnection conn = ConnectorConnection.builder()
            .connectorKey("linear")
            .config("{\"mcpUrl\":\"http://x/mcp\",\"mcpAllow\":\"create_issue\"}").build();
        when(repository.findByWorkspaceId(1L)).thenReturn(List.of(conn));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(def("create_issue"), def("delete_issue")));

        List<AgentTool> tools = service.toolsFor(ctx);

        assertThat(tools).extracting(AgentTool::name).containsExactly("linear__create_issue");
    }

    @Test
    @DisplayName("serverStatuses : serveur joignable → reachable + outils ; en échec → error")
    void server_statuses_reports_reachability() throws Exception {
        when(repository.findByWorkspaceId(1L)).thenReturn(List.of(mcpConnector()));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(def("create_issue")));

        List<WorkspaceMcpService.McpServerStatus> statuses = service.serverStatuses(1L);

        assertThat(statuses).hasSize(1);
        assertThat(statuses.get(0).reachable()).isTrue();
        assertThat(statuses.get(0).tools()).containsExactly("create_issue");
        assertThat(statuses.get(0).error()).isNull();
    }

    @Test
    @DisplayName("serverStatuses : serveur en échec → reachable=false + message d'erreur")
    void server_statuses_reports_failure() {
        when(repository.findByWorkspaceId(1L)).thenReturn(List.of(mcpConnector()));
        when(client.initialize(any())).thenThrow(new BusinessException("timeout"));

        List<WorkspaceMcpService.McpServerStatus> statuses = service.serverStatuses(1L);

        assertThat(statuses).hasSize(1);
        assertThat(statuses.get(0).reachable()).isFalse();
        assertThat(statuses.get(0).error()).isEqualTo("timeout");
    }

    @Test
    @DisplayName("serverTools : renvoie les outils riches (schéma + readOnly) après allow-list")
    void server_tools_returns_rich_defs() throws Exception {
        ConnectorConnection conn = ConnectorConnection.builder()
            .connectorKey("linear")
            .config("{\"mcpUrl\":\"http://x/mcp\",\"mcpAllow\":\"create_issue\"}").build();
        when(repository.findByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(Optional.of(conn));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(def("create_issue"), def("delete_issue")));

        List<WorkspaceMcpService.McpToolInfo> tools = service.serverTools(1L, "linear");

        assertThat(tools).hasSize(1); // allow-list ne garde que create_issue
        assertThat(tools.get(0).name()).isEqualTo("create_issue");
        assertThat(tools.get(0).description()).isEqualTo("desc create_issue");
        assertThat(tools.get(0).inputSchema().path("type").asText()).isEqualTo("object");
        assertThat(tools.get(0).readOnly()).isFalse();
    }

    @Test
    @DisplayName("serverTools : connecteur non connecté → ResourceNotFoundException")
    void server_tools_unknown_connector() {
        when(repository.findByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.serverTools(1L, "linear"))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("connectServer : persiste mcpUrl (+ allow-list) en config, sans token vide")
    void connect_server_persists_config() {
        Workspace ws = Workspace.builder().id(1L).slug("acme").build();
        when(repository.findByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(Optional.empty());

        service.connectServer(ws, "linear", "http://x/mcp", null, "create_issue");

        ArgumentCaptor<ConnectorConnection> captor = ArgumentCaptor.forClass(ConnectorConnection.class);
        verify(repository).save(captor.capture());
        String config = captor.getValue().getConfig();
        assertThat(config).contains("mcpUrl").contains("http://x/mcp")
            .contains("mcpAllow").contains("create_issue");
        assertThat(config).doesNotContain("mcpToken");
    }

    @Test
    @DisplayName("connectServer : refuse une URL vers le réseau interne, sans rien enregistrer (OSS-1.2)")
    void connectServer_refusesInternalUrl() {
        Workspace ws = Workspace.builder().id(1L).slug("acme").build();
        doThrow(new BusinessException("MCP server refused: internal address"))
            .when(client).assertAllowed("http://169.254.169.254/latest");

        assertThatThrownBy(() -> service.connectServer(ws, "linear", " http://169.254.169.254/latest ", null, null))
            .isInstanceOf(BusinessException.class);
        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("disconnectServer : supprime la ligne connecteur")
    void disconnect_server_deletes() {
        when(repository.existsByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(true);

        service.disconnectServer(1L, "linear");

        verify(repository).deleteByWorkspaceIdAndConnectorKey(1L, "linear");
    }
}
