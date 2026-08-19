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
import com.taskforce.tf_api.core.enums.PlanFeature;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.PlanFeatureService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
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
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private PlanFeatureService planFeatureService;
    @Mock private McpClient client;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private WorkspaceMcpService service;

    private final AgentContext ctx = new AgentContext("acme", 1L, 7L);
    private final McpClient.Session session = new McpClient.Session("http://x/mcp", "sid", null);

    @BeforeEach
    void setup() {
        service = new WorkspaceMcpService(repository, workspaceRepository, planFeatureService, client, objectMapper);
        ReflectionTestUtils.setField(service, "cacheTtlMs", 60_000L);
    }

    /** Stub du gate : propriétaire BUSINESS → intégrations autorisées. */
    private void entitled() {
        when(workspaceRepository.findOwnerPlanBySlug("acme")).thenReturn(Optional.of(PlanType.BUSINESS));
        when(planFeatureService.has(PlanType.BUSINESS, PlanFeature.INTEGRATIONS)).thenReturn(true);
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
        entitled();
        when(repository.findByWorkspaceId(1L)).thenReturn(List.of(mcpConnector()));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(def("create_issue")));

        List<AgentTool> tools = service.toolsFor(ctx);

        assertThat(tools).hasSize(1);
        assertThat(tools.get(0).name()).isEqualTo("linear__create_issue");
    }

    @Test
    @DisplayName("gate : plan sans intégrations (FREE) → aucun outil externe, pas de handshake")
    void free_plan_no_external_tools() {
        when(workspaceRepository.findOwnerPlanBySlug("acme")).thenReturn(Optional.of(PlanType.FREE));
        when(planFeatureService.has(PlanType.FREE, PlanFeature.INTEGRATIONS)).thenReturn(false);

        assertThat(service.toolsFor(ctx)).isEmpty();
        verify(repository, never()).findByWorkspaceId(any());
    }

    @Test
    @DisplayName("ignore les connecteurs sans mcpUrl (ne sont pas des serveurs MCP)")
    void skips_non_mcp_connectors() {
        entitled();
        ConnectorConnection plain = ConnectorConnection.builder()
            .connectorKey("stripe").config("{\"apiKey\":\"sk_test\"}").build();
        when(repository.findByWorkspaceId(1L)).thenReturn(List.of(plain));

        assertThat(service.toolsFor(ctx)).isEmpty();
        verify(client, never()).initialize(any());
    }

    @Test
    @DisplayName("cache TTL : deux appels → un seul handshake serveur")
    void caches_within_ttl() throws Exception {
        entitled();
        when(repository.findByWorkspaceId(1L)).thenReturn(List.of(mcpConnector()));
        when(client.initialize(any())).thenReturn(session);
        when(client.listTools(session)).thenReturn(List.of(def("create_issue")));

        service.toolsFor(ctx);
        service.toolsFor(ctx);

        verify(client, times(1)).initialize(any());
    }

    @Test
    @DisplayName("execute() rouvre une session et appelle l'outil par son nom d'origine (non namespacé)")
    void execute_delegates_with_original_name() {
        when(repository.findByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(Optional.of(mcpConnector()));
        when(client.initialize(any())).thenReturn(session);
        when(client.callTool(eq(session), eq("create_issue"), any())).thenReturn("DONE");

        String result = service.execute(1L, "linear__create_issue", Map.of("title", "Bug"));

        assertThat(result).isEqualTo("DONE");
        verify(client).callTool(eq(session), eq("create_issue"), any());
    }

    @Test
    @DisplayName("serveur MCP en échec → ignoré, liste vide (n'interrompt pas l'agent)")
    void failing_server_is_skipped() {
        entitled();
        when(repository.findByWorkspaceId(1L)).thenReturn(List.of(mcpConnector()));
        when(client.initialize(any())).thenThrow(new BusinessException("down"));

        assertThat(service.toolsFor(ctx)).isEmpty();
    }

    @Test
    @DisplayName("allow-list (mcpAllow) : seuls les outils autorisés sont exposés")
    void allow_list_filters_tools() throws Exception {
        entitled();
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
    @DisplayName("disconnectServer : supprime la ligne connecteur")
    void disconnect_server_deletes() {
        when(repository.existsByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(true);

        service.disconnectServer(1L, "linear");

        verify(repository).deleteByWorkspaceIdAndConnectorKey(1L, "linear");
    }
}
