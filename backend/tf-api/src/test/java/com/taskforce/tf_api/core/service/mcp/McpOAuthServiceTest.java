package com.taskforce.tf_api.core.service.mcp;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.McpOAuthState;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.repository.McpOAuthStateRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.mcp.McpOAuthDiscovery.DiscoveredAuth;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires - {@link McpOAuthService} (TF-MCP-02). Le serveur OAuth externe est mocke (via
 * {@link McpOAuthDiscovery} et {@link McpOAuthClient}), donc le flux est verifie de facon
 * deterministe : construction de l'URL d'autorisation (PKCE S256, state, resource) et callback
 * (echange, stockage, redirection <b>toujours</b> vers l'UI).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("McpOAuthService")
class McpOAuthServiceTest {

    private static final long WS_ID = 100L;
    private static final long USER_ID = 7L;

    @Mock private McpOAuthDiscovery discovery;
    @Mock private McpOAuthClient client;
    @Mock private McpOAuthStateRepository stateRepository;
    @Mock private ConnectorConnectionRepository connectionRepository;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private McpTokenService tokenService;
    @Mock private WorkspaceMcpService workspaceMcp;
    @InjectMocks private McpOAuthService service;

    private final ObjectMapper om = new ObjectMapper();
    private final Workspace ws = Workspace.builder().id(WS_ID).slug("acme").build();

    @BeforeEach
    void config() {
        ReflectionTestUtils.setField(service, "redirectBase", "http://localhost:8080");
        ReflectionTestUtils.setField(service, "appBase", "http://localhost:3000");
        ReflectionTestUtils.setField(service, "clientName", "TaskForce");
    }

    private DiscoveredAuth auth(String regEp) {
        return new DiscoveredAuth("https://as.ex", "https://as.ex/authorize", "https://as.ex/token", regEp, "mcp");
    }

    private McpOAuthState openState(String state) {
        return McpOAuthState.builder()
            .state(state).workspaceId(WS_ID).userId(USER_ID).connectorKey("linear")
            .mcpUrl("https://203.0.113.10/mcp").codeVerifier("verifier").tokenEndpoint("https://as.ex/token")
            .clientId("cid-123").clientSecret("csecret")
            .redirectUri("http://localhost:8080/api/mcp/oauth/callback")
            .issuer("https://as.ex").expiresAt(LocalDateTime.now().plusMinutes(5))
            .build();
    }

    // =========================================================================
    @Test
    @DisplayName("start : discovery + DCR -> sauve le state (PKCE) + URL d'autorisation complete")
    void startBuildsAuthorizeUrl() throws Exception {
        when(discovery.discover("https://203.0.113.10/mcp")).thenReturn(auth("https://as.ex/register"));
        when(client.postJson(eq("https://as.ex/register"), any())).thenReturn(om.readTree("{\"client_id\":\"cid-123\"}"));

        String url = service.start(ws, USER_ID, "linear", "https://203.0.113.10/mcp");

        ArgumentCaptor<McpOAuthState> captor = ArgumentCaptor.forClass(McpOAuthState.class);
        verify(stateRepository).save(captor.capture());
        McpOAuthState row = captor.getValue();
        assertThat(row.getWorkspaceId()).isEqualTo(WS_ID);
        assertThat(row.getConnectorKey()).isEqualTo("linear");
        assertThat(row.getMcpUrl()).isEqualTo("https://203.0.113.10/mcp");
        assertThat(row.getClientId()).isEqualTo("cid-123");
        assertThat(row.getTokenEndpoint()).isEqualTo("https://as.ex/token");
        assertThat(row.getCodeVerifier()).isNotBlank();
        assertThat(row.getExpiresAt()).isAfter(LocalDateTime.now());

        assertThat(url).startsWith("https://as.ex/authorize?");
        assertThat(url).contains("response_type=code")
            .contains("client_id=cid-123")
            .contains("code_challenge_method=S256")
            .contains("code_challenge=")
            .contains("state=" + row.getState())
            .contains("resource=");
    }

    @Test
    @DisplayName("start : sans registration_endpoint -> DCR requis, echec clair, aucun state")
    void startWithoutDcrFails() {
        when(discovery.discover(anyString())).thenReturn(auth(null));
        assertThatThrownBy(() -> service.start(ws, USER_ID, "linear", "https://203.0.113.10/mcp"))
            .isInstanceOf(BusinessException.class);
        verify(stateRepository, never()).save(any());
    }

    // =========================================================================
    @Test
    @DisplayName("callback OK : echange le code, stocke les tokens, invalide le cache, redirige connected")
    void callbackSuccess() throws Exception {
        when(stateRepository.findById("st-1")).thenReturn(Optional.of(openState("st-1")));
        when(client.postForm(eq("https://as.ex/token"), any()))
            .thenReturn(om.readTree("{\"access_token\":\"AT\",\"refresh_token\":\"RT\",\"expires_in\":3600}"));
        when(connectionRepository.findByWorkspaceIdAndConnectorKey(WS_ID, "linear")).thenReturn(Optional.empty());
        when(workspaceRepository.getReferenceById(WS_ID)).thenReturn(ws);
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));

        String redirect = service.callback("st-1", "code-xyz", null);

        assertThat(redirect).isEqualTo("http://localhost:3000/acme/settings?section=integrations&mcp=connected");
        verify(tokenService).storeInitialTokens(any(ConnectorConnection.class), any(), eq("https://203.0.113.10/mcp"),
            eq("https://as.ex"), eq("cid-123"), eq("csecret"), eq("https://as.ex/token"));
        verify(workspaceMcp).invalidate(WS_ID);
        verify(stateRepository).deleteById("st-1");
    }

    @Test
    @DisplayName("callback : state inconnu -> erreur generique, pas de suppression")
    void callbackUnknownState() {
        when(stateRepository.findById("nope")).thenReturn(Optional.empty());
        assertThat(service.callback("nope", "code", null)).isEqualTo("http://localhost:3000/?mcp=error");
        verify(stateRepository, never()).deleteById(anyString());
    }

    @Test
    @DisplayName("callback : refus du fournisseur -> erreur (UI) + state supprime, pas d'echange")
    void callbackProviderError() {
        when(stateRepository.findById("st-2")).thenReturn(Optional.of(openState("st-2")));
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));

        String redirect = service.callback("st-2", null, "access_denied");

        assertThat(redirect).isEqualTo("http://localhost:3000/acme/settings?section=integrations&mcp=error");
        verify(client, never()).postForm(anyString(), any());
        verify(stateRepository).deleteById("st-2");
    }
}
