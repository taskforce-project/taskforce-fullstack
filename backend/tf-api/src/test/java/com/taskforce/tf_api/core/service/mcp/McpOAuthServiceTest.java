package com.taskforce.tf_api.core.service.mcp;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.ConnectionScope;
import com.taskforce.tf_api.core.enums.ConnectionState;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.ConnectorApp;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.McpOAuthState;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.repository.McpOAuthStateRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;
import com.taskforce.tf_api.core.service.mcp.McpOAuthDiscovery.DiscoveredAuth;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService.ServerIdentity;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires - {@link McpOAuthService} (TF-MCP-02, séance n°22 R154 et R158). Le serveur OAuth externe est mocke
 * (via {@link McpOAuthDiscovery}, {@link McpOAuthClient} et {@link McpClientRegistrar}), donc le flux est verifie de
 * facon deterministe : le chemin choisi par le geste « Connect », l'URL d'autorisation (PKCE S256, state, resource, les
 * seules portées utiles) et le callback (émetteur vérifié, echange, connexion de la personne, redirection
 * <b>toujours</b> vers l'UI). Le flux de bout en bout, contre un faux serveur, est dans {@link McpConnectContractTest}.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("McpOAuthService")
class McpOAuthServiceTest {

    private static final long WS_ID = 100L;
    private static final long USER_ID = 7L;

    @Mock private McpOAuthDiscovery discovery;
    @Mock private McpOAuthClient client;
    @Mock private McpOAuthStateRepository stateRepository;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private UserRepository userRepository;
    @Mock private McpTokenService tokenService;
    @Mock private WorkspaceMcpService workspaceMcp;
    @Mock private McpClientRegistrar registrar;
    @Mock private ConnectorAppRepository apps;
    @Mock private ConnectorConnectionRepository connections;
    @Mock private AuthorizationService authorization;

    private final ObjectMapper om = new ObjectMapper();
    private final Workspace ws = Workspace.builder().id(WS_ID).slug("acme").build();
    private final User person = User.builder().id(USER_ID).email("a@acme.test").build();
    private ConnectorCatalog catalog;
    private McpOAuthSettings settings;
    private McpOAuthService service;

    @BeforeEach
    void setUp() {
        catalog = new ConnectorCatalog();
        catalog.build();
        settings = new McpOAuthSettings("http://localhost:8080", "", "http://localhost:3000", "TaskForce", "web", "");
        service = new McpOAuthService(discovery, client, stateRepository, workspaceRepository, userRepository,
            tokenService, workspaceMcp, registrar, settings, catalog, apps, connections, om, authorization);
    }

    /** Le jeton {@code finish} que l'adresse de retour porte. */
    private static String finishOf(String redirect) {
        return java.net.URLDecoder.decode(redirect.replaceAll(".*[?&]finish=([^&]+).*", "$1"),
            java.nio.charset.StandardCharsets.UTF_8);
    }

    private DiscoveredAuth auth(boolean issSupported) {
        // authorization_endpoint = IP publique (TEST-NET) : passe SsrfGuard sans DNS (voir start()).
        return new DiscoveredAuth("https://as.ex", "https://203.0.113.11/authorize", "https://as.ex/token",
            "https://as.ex/register", "read write admin", "https://203.0.113.10/mcp", null, "https://as.ex/revoke",
            false, issSupported);
    }

    private McpOAuthState openState(String state) {
        return McpOAuthState.builder()
            .state(state).workspaceId(WS_ID).userId(USER_ID).connectorKey("linear")
            .mcpUrl("https://203.0.113.10/mcp").codeVerifier("verifier").tokenEndpoint("https://as.ex/token")
            .clientId("cid-123").clientSecret("csecret")
            .redirectUri("http://localhost:8080/api/mcp/oauth/callback")
            .issuer("https://as.ex").revocationEndpoint("https://as.ex/revoke").clientSource("dcr")
            .resource("https://203.0.113.10/mcp")
            .expiresAt(LocalDateTime.now().plusMinutes(5))
            .build();
    }

    // =========================================================================
    @Test
    @DisplayName("start : client du registrar, les seules portées de lecture du préréglage, PKCE et resource")
    void startBuildsAuthorizeUrl() {
        service.allowLocalServersForContractTests(); // aucun nom résolu dans l'essai
        when(workspaceMcp.resolveServer(WS_ID, "linear", null)).thenReturn(new ServerIdentity("linear", null));
        // La lecture seule du serveur officiel : l'écriture n'est pas accordée.
        when(discovery.discover("https://mcp.linear.app/mcp/readonly")).thenReturn(auth(true));
        // Le serveur officiel du préréglage : son émetteur est épinglé.
        when(registrar.clientFor(eq(WS_ID), eq("linear"), any(), eq("http://localhost:8080/api/mcp/oauth/callback"),
                eq(true), eq(false)))
            .thenReturn(new McpClientRegistrar.RegisteredClient("cid-123", null, McpClientRegistrar.DCR));

        String url = service.start(ws, USER_ID, "linear", null, "https://mcp.linear.app/mcp", "/acme?import=linear");

        ArgumentCaptor<McpOAuthState> captor = ArgumentCaptor.forClass(McpOAuthState.class);
        verify(stateRepository).save(captor.capture());
        McpOAuthState row = captor.getValue();
        assertThat(row.getWorkspaceId()).isEqualTo(WS_ID);
        assertThat(row.getConnectorKey()).isEqualTo("linear");
        assertThat(row.getReturnTo()).isEqualTo("/acme?import=linear");
        assertThat(row.getClientId()).isEqualTo("cid-123");
        assertThat(row.getScope()).isEqualTo("read"); // jamais « read write admin » annoncés par le serveur
        assertThat(row.isShared()).isFalse();
        assertThat(row.isIssRequired()).isTrue();
        assertThat(row.getRevocationEndpoint()).isEqualTo("https://as.ex/revoke");
        assertThat(row.getCodeVerifier()).isNotBlank();
        assertThat(url).startsWith("https://203.0.113.11/authorize?")
            .contains("client_id=cid-123").contains("code_challenge_method=S256").contains("code_challenge=")
            .contains("state=" + row.getState()).contains("resource=").contains("scope=read")
            .doesNotContain("admin");
    }

    @Test
    @DisplayName("start : aucun chemin d'inscription -> l'erreur du registrar remonte, aucun state")
    void startWithoutAnyClientFails() {
        when(workspaceMcp.resolveServer(WS_ID, "custom-docs", "Docs")).thenReturn(new ServerIdentity("custom-docs", "Docs"));
        when(discovery.discover(anyString())).thenReturn(auth(false));
        // Un serveur sans préréglage : aucun émetteur épinglé, donc aucun client enregistré d'avance.
        when(registrar.clientFor(any(), any(), any(), any(), eq(false), anyBoolean()))
            .thenThrow(new McpClientRegistrar.NoClient("none"));

        assertThatThrownBy(() -> service.start(ws, USER_ID, "custom-docs", "Docs", "https://203.0.113.10/mcp", null))
            .isInstanceOf(McpClientRegistrar.NoClient.class);
        verify(stateRepository, never()).save(any());
    }

    @Test
    @DisplayName("start : la clé d'un préréglage avec une autre adresse que son serveur officiel -> refus, aucun appel")
    void startRefusesAnotherServerForAPreset() {
        assertThatThrownBy(() -> service.start(ws, USER_ID, "linear", null, "https://203.0.113.10/mcp", null))
            .isInstanceOf(BusinessException.class).hasMessageContaining("official server");
        assertThatThrownBy(() -> service.start(ws, USER_ID, "google-drive", null, "https://203.0.113.10/mcp", null))
            .isInstanceOf(BusinessException.class);
        verifyNoInteractions(discovery, client, registrar);
        verify(stateRepository, never()).save(any());
    }

    @Test
    @DisplayName("connect : la clé d'un préréglage avec une autre adresse, jeton ou pas -> refus, rien d'enregistré")
    void connectRefusesAnotherServerForAPreset() {
        assertThatThrownBy(() -> service.connect(ws, person, new McpOAuthService.ConnectRequest("linear", null,
            "https://203.0.113.10/mcp", "tok", null, false, false, false, null))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.connect(ws, person, new McpOAuthService.ConnectRequest("linear", null,
            "https://203.0.113.10/mcp", null, null, false, false, false, null))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.connect(ws, person, new McpOAuthService.ConnectRequest("microsoft-365",
            null, "https://203.0.113.10/", null, null, false, false, false, null))).isInstanceOf(BusinessException.class);
        verify(workspaceMcp, never()).connectServer(any(), any(), any());
        verifyNoInteractions(discovery, client, registrar);
    }

    @Test
    @DisplayName("start : cle refusee (native ou inconnue) -> aucun appel au serveur, aucun state")
    void startRefusesAnUnknownKey() {
        when(workspaceMcp.resolveServer(WS_ID, "github", null)).thenThrow(new BusinessException("Unknown MCP server: github"));

        assertThatThrownBy(() -> service.start(ws, USER_ID, "github", null, "https://203.0.113.10/mcp", null))
            .isInstanceOf(BusinessException.class);
        verifyNoInteractions(discovery, client, registrar);
        verify(stateRepository, never()).save(any());
    }

    @Test
    @DisplayName("scopeFor : un serveur sans préréglage demande les portées de son 401, sinon aucune")
    void customServersAskForTheChallengeScopeOnly() {
        DiscoveredAuth challenged = new DiscoveredAuth("https://as.ex", "https://203.0.113.11/a", "https://as.ex/t",
            null, "a b c d", null, "files:read", null, false, false);
        assertThat(service.scopeFor("custom-docs", challenged, false)).isEqualTo("files:read");
        assertThat(service.scopeFor("custom-docs", auth(false), false)).isNull();
        assertThat(service.scopeFor("linear", auth(false), true)).isEqualTo("read write");
    }

    // =========================================================================
    @Test
    @DisplayName("callback OK : garde le code avec son state, n'échange rien, renvoie vers l'app avec un jeton à usage unique")
    void callbackKeepsTheCodeForTheApp() {
        McpOAuthState row = openState("st-1");
        when(stateRepository.findById("st-1")).thenReturn(Optional.of(row));
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));

        String redirect = service.callback("st-1", "code-xyz", null, "https://as.ex");

        assertThat(redirect).startsWith(
            "http://localhost:3000/acme/settings?section=integrations&mcp=finish&connector=linear&state=st-1&finish=");
        assertThat(finishOf(redirect)).hasSizeGreaterThanOrEqualTo(32);
        assertThat(row.getCode()).isEqualTo("code-xyz");
        assertThat(row.getFinishHash()).hasSize(64).isNotEqualTo(finishOf(redirect));
        verify(stateRepository).save(row);
        verify(client, never()).postForm(anyString(), any());
        verify(stateRepository, never()).deleteById(anyString());
    }

    @Test
    @DisplayName("complete : la personne qui a lancé le flux, avec le jeton du retour -> échange, jetons et compte sur sa connexion")
    void completeExchangesForThePersonWhoStarted() throws Exception {
        McpOAuthState row = openState("st-1");
        when(stateRepository.findById("st-1")).thenReturn(Optional.of(row));
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));
        String finish = finishOf(service.callback("st-1", "code-xyz", null, "https://as.ex"));
        when(authorization.isMember(WS_ID, USER_ID)).thenReturn(true);
        when(client.postForm(eq("https://as.ex/token"), any())).thenReturn(om.readTree(
            "{\"access_token\":\"AT\",\"refresh_token\":\"RT\",\"expires_in\":3600,\"owner\":{\"user\":{\"name\":\"Ada\"}}}"));
        when(workspaceRepository.getReferenceById(WS_ID)).thenReturn(ws);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(person));
        ConnectorConnection conn = ConnectorConnection.builder().workspace(ws).connectorKey("linear")
            .scope(ConnectionScope.PERSONAL).owner(person).build();
        when(workspaceMcp.ownConnection(ws, person, "linear", false)).thenReturn(conn);

        McpOAuthService.Completion done = service.complete(USER_ID, "st-1", finish);

        assertThat(done).isEqualTo(new McpOAuthService.Completion("connected", "linear"));
        @SuppressWarnings("unchecked")
        ArgumentCaptor<java.util.Map<String, String>> form = ArgumentCaptor.forClass(java.util.Map.class);
        verify(client).postForm(eq("https://as.ex/token"), form.capture());
        assertThat(form.getValue()).containsEntry("code", "code-xyz").containsEntry("code_verifier", "verifier");
        ArgumentCaptor<McpTokenService.OAuthGrant> grant = ArgumentCaptor.forClass(McpTokenService.OAuthGrant.class);
        verify(tokenService).storeInitialTokens(eq(conn), any(), grant.capture());
        assertThat(grant.getValue().issuer()).isEqualTo("https://as.ex");
        assertThat(grant.getValue().revocationEndpoint()).isEqualTo("https://as.ex/revoke");
        assertThat(conn.getAccountLabel()).isEqualTo("Ada");
        verify(workspaceMcp).pinQuietly(conn);
        verify(workspaceMcp).invalidate(WS_ID);
        verify(stateRepository).deleteById("st-1");
        verify(registrar, never()).pinCompanyIssuer(any(), any(), any());
    }

    @Test
    @DisplayName("complete : une connexion partagée qui aboutit entre au journal de l'espace, sans jeton ; la sienne, non")
    void aSharedConnectionThatSucceedsIsRecorded() throws Exception {
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));
        when(authorization.isMember(WS_ID, USER_ID)).thenReturn(true);
        when(authorization.isManager(WS_ID, USER_ID)).thenReturn(true);
        when(client.postForm(eq("https://as.ex/token"), any()))
            .thenReturn(om.readTree("{\"access_token\":\"AT-secret\",\"refresh_token\":\"RT-secret\"}"));
        when(workspaceRepository.getReferenceById(WS_ID)).thenReturn(ws);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(person));
        when(workspaceMcp.ownConnection(eq(ws), eq(person), eq("linear"), anyBoolean())).thenAnswer(inv ->
            ConnectorConnection.builder().workspace(ws).connectorKey("linear").build());
        McpOAuthState own = openState("st-own");
        McpOAuthState shared = openState("st-shared");
        shared.setShared(true);
        shared.setAllowWrites(true);
        when(stateRepository.findById("st-own")).thenReturn(Optional.of(own));
        when(stateRepository.findById("st-shared")).thenReturn(Optional.of(shared));

        assertThat(service.complete(USER_ID, "st-own", finishOf(service.callback("st-own", "c-1", null, "https://as.ex")))
            .outcome()).isEqualTo("connected");
        verify(workspaceMcp, never()).recordShared(any(), any(), any(), any());

        assertThat(service.complete(USER_ID, "st-shared",
            finishOf(service.callback("st-shared", "c-2", null, "https://as.ex"))).outcome()).isEqualTo("connected");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<java.util.Map<String, Object>> details = ArgumentCaptor.forClass(java.util.Map.class);
        verify(workspaceMcp).recordShared(eq(WS_ID), eq(USER_ID), eq("linear"), details.capture());
        assertThat(details.getValue()).containsEntry("change", "connected").containsEntry("via", "oauth")
            .containsEntry("host", "203.0.113.10").containsEntry("writes", true);
        assertThat(details.getValue().toString()).doesNotContain("AT-secret").doesNotContain("RT-secret");
    }

    @Test
    @DisplayName("complete : l'entrée d'une connexion partagée vient après la dernière étape qui peut échouer")
    void theSharedEntryComesAfterTheLastStepThatCanFail() throws Exception {
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));
        when(authorization.isMember(WS_ID, USER_ID)).thenReturn(true);
        when(authorization.isManager(WS_ID, USER_ID)).thenReturn(true);
        when(client.postForm(eq("https://as.ex/token"), any())).thenReturn(om.readTree("{\"access_token\":\"AT\"}"));
        when(workspaceRepository.getReferenceById(WS_ID)).thenReturn(ws);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(person));
        when(workspaceMcp.ownConnection(ws, person, "glean", true)).thenReturn(ConnectorConnection.builder()
            .workspace(ws).connectorKey("glean").scope(ConnectionScope.WORKSPACE).build());
        McpOAuthState row = openState("st-pin");
        row.setConnectorKey("glean");
        row.setMcpUrl("https://203.0.113.20/mcp");
        row.setClientSource(McpClientRegistrar.COMPANY);
        row.setShared(true);
        when(stateRepository.findById("st-pin")).thenReturn(Optional.of(row));
        org.mockito.Mockito.doThrow(new IllegalStateException("database down"))
            .when(registrar).pinCompanyIssuer(WS_ID, "glean", "https://as.ex");

        String finish = finishOf(service.callback("st-pin", "code-p", null, "https://as.ex"));

        assertThat(service.complete(USER_ID, "st-pin", finish).outcome()).isEqualTo("error");
        verify(workspaceMcp, never()).recordShared(any(), any(), any(), any());
    }

    @Test
    @DisplayName("complete : un outil sans serveur officiel, fini par l'application de l'entreprise -> l'émetteur s'épingle "
        + "sur elle quand un propriétaire ou un administrateur aboutit, jamais pour un membre")
    void aManagerConnectionPinsTheIssuerOfTheCompanyApp() throws Exception {
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));
        when(authorization.isMember(WS_ID, USER_ID)).thenReturn(true);
        when(client.postForm(eq("https://as.ex/token"), any())).thenReturn(om.readTree("{\"access_token\":\"AT\"}"));
        when(workspaceRepository.getReferenceById(WS_ID)).thenReturn(ws);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(person));
        when(workspaceMcp.ownConnection(ws, person, "glean", false)).thenAnswer(inv -> ConnectorConnection.builder()
            .workspace(ws).connectorKey("glean").scope(ConnectionScope.PERSONAL).owner(person).build());
        java.util.function.Function<String, McpOAuthState> glean = state -> {
            McpOAuthState row = openState(state);
            row.setConnectorKey("glean");
            row.setMcpUrl("https://203.0.113.20/mcp");
            row.setClientSource(McpClientRegistrar.COMPANY);
            when(stateRepository.findById(state)).thenReturn(Optional.of(row));
            return row;
        };

        glean.apply("st-m");
        String memberFinish = finishOf(service.callback("st-m", "code-m", null, "https://as.ex"));
        when(authorization.isManager(WS_ID, USER_ID)).thenReturn(false);
        assertThat(service.complete(USER_ID, "st-m", memberFinish).outcome()).isEqualTo("connected");
        verify(registrar, never()).pinCompanyIssuer(any(), any(), any());

        glean.apply("st-g");
        String managerFinish = finishOf(service.callback("st-g", "code-g", null, "https://as.ex"));
        when(authorization.isManager(WS_ID, USER_ID)).thenReturn(true);
        assertThat(service.complete(USER_ID, "st-g", managerFinish).outcome()).isEqualTo("connected");
        verify(registrar).pinCompanyIssuer(WS_ID, "glean", "https://as.ex");
    }

    @Test
    @DisplayName("complete : une autre personne connectée, même avec le jeton du retour -> refus, rien d'échangé, le flux s'efface")
    void completeIsBoundToThePersonWhoStarted() {
        McpOAuthState row = openState("st-1");
        when(stateRepository.findById("st-1")).thenReturn(Optional.of(row));
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));
        String finish = finishOf(service.callback("st-1", "code-xyz", null, "https://as.ex"));

        McpOAuthService.Completion done = service.complete(USER_ID + 1, "st-1", finish);

        assertThat(done.outcome()).isEqualTo("error");
        verify(client, never()).postForm(anyString(), any());
        verify(tokenService, never()).storeInitialTokens(any(), any(), any());
        verify(stateRepository).deleteById("st-1");
    }

    @Test
    @DisplayName("complete : la personne qui a lancé le flux, sans le jeton du retour ou avant le retour -> refus, rien d'échangé")
    void completeNeedsTheTokenOfTheReturn() {
        McpOAuthState returned = openState("st-1");
        when(stateRepository.findById("st-1")).thenReturn(Optional.of(returned));
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));
        service.callback("st-1", "code-xyz", null, "https://as.ex");
        when(stateRepository.findById("st-2")).thenReturn(Optional.of(openState("st-2")));

        assertThat(service.complete(USER_ID, "st-1", "not-the-token").outcome()).isEqualTo("error");
        assertThat(service.complete(USER_ID, "st-2", "any").outcome()).isEqualTo("error");
        assertThat(service.complete(USER_ID, "unknown", "any")).isEqualTo(new McpOAuthService.Completion("error", null));
        verify(client, never()).postForm(anyString(), any());
        verify(stateRepository, never()).deleteById(anyString());
    }

    @Test
    @DisplayName("complete : un mauvais jeton laisse le flux tel quel ; le jeton du retour le finit ensuite, puis il s'efface")
    void aWrongTokenLeavesTheFlowForTheRightOne() throws Exception {
        McpOAuthState row = openState("st-1");
        when(stateRepository.findById("st-1")).thenReturn(Optional.of(row));
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));
        String finish = finishOf(service.callback("st-1", "code-xyz", null, "https://as.ex"));

        assertThat(service.complete(USER_ID, "st-1", "not-the-token").outcome()).isEqualTo("error");
        verify(stateRepository, never()).deleteById(anyString());
        assertThat(row.getCode()).isEqualTo("code-xyz");

        when(authorization.isMember(WS_ID, USER_ID)).thenReturn(true);
        when(client.postForm(eq("https://as.ex/token"), any())).thenReturn(om.readTree("{\"access_token\":\"AT\"}"));
        when(workspaceRepository.getReferenceById(WS_ID)).thenReturn(ws);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(person));
        when(workspaceMcp.ownConnection(ws, person, "linear", false)).thenReturn(ConnectorConnection.builder()
            .workspace(ws).connectorKey("linear").scope(ConnectionScope.PERSONAL).owner(person).build());

        assertThat(service.complete(USER_ID, "st-1", finish)).isEqualTo(new McpOAuthService.Completion("connected", "linear"));
        verify(stateRepository).deleteById("st-1");
    }

    @Test
    @DisplayName("callback : un state qui revient deux fois -> erreur, le flux reste celui du premier retour")
    void callbackReturnsOnce() {
        McpOAuthState row = openState("st-1");
        when(stateRepository.findById("st-1")).thenReturn(Optional.of(row));
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));
        service.callback("st-1", "code-xyz", null, "https://as.ex");
        String firstFinish = row.getFinishHash();

        assertThat(service.callback("st-1", "code-2", null, "https://as.ex")).contains("mcp=error");
        verify(stateRepository, never()).deleteById(anyString());
        assertThat(row.getCode()).isEqualTo("code-xyz");
        assertThat(row.getFinishHash()).isEqualTo(firstFinish);
    }

    @Test
    @DisplayName("callback : un autre émetteur au retour (RFC 9207) -> erreur, aucun échange")
    void callbackRefusesAnotherIssuer() {
        when(stateRepository.findById("st-x")).thenReturn(Optional.of(openState("st-x")));
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));

        assertThat(service.callback("st-x", "code", null, "https://evil.ex")).endsWith("mcp=error&connector=linear");
        verify(client, never()).postForm(anyString(), any());
        verify(stateRepository, never()).deleteById(anyString());
    }

    @Test
    @DisplayName("callback : émetteur annoncé mais absent du retour -> erreur, aucun échange")
    void callbackRequiresTheIssuerWhenAnnounced() {
        McpOAuthState row = openState("st-i");
        row.setIssRequired(true);
        when(stateRepository.findById("st-i")).thenReturn(Optional.of(row));
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));

        assertThat(service.callback("st-i", "code", null, null)).contains("mcp=error");
        verify(client, never()).postForm(anyString(), any());
    }

    @Test
    @DisplayName("callback OK : returnTo present -> redirige vers ce chemin (retour fluide), où l'app finit")
    void callbackHonorsReturnTo() {
        McpOAuthState row = openState("st-rt");
        row.setReturnTo("/acme?import=linear");
        when(stateRepository.findById("st-rt")).thenReturn(Optional.of(row));

        assertThat(service.callback("st-rt", "code-xyz", null, null))
            .startsWith("http://localhost:3000/acme?import=linear&mcp=finish&connector=linear&state=st-rt&finish=");
    }

    @Test
    @DisplayName("callback : state inconnu -> erreur generique, pas de suppression")
    void callbackUnknownState() {
        when(stateRepository.findById("nope")).thenReturn(Optional.empty());
        assertThat(service.callback("nope", "code", null)).isEqualTo("http://localhost:3000/?mcp=error");
        verify(stateRepository, never()).deleteById(anyString());
    }

    @Test
    @DisplayName("callback : refus de la personne -> erreur (UI), pas d'échange ; le flux s'efface à son échéance")
    void callbackProviderError() {
        when(stateRepository.findById("st-2")).thenReturn(Optional.of(openState("st-2")));
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));

        assertThat(service.callback("st-2", null, "access_denied"))
            .isEqualTo("http://localhost:3000/acme/settings?section=integrations&mcp=error&connector=linear");
        verify(client, never()).postForm(anyString(), any());
        verify(stateRepository, never()).deleteById(anyString());
    }

    /**
     * Ce qu'il faut pour que l'attente de l'administrateur aboutisse si le retour la choisissait : la personne et sa
     * connexion. Sans ces réponses, l'attente échouerait sur la personne introuvable et l'essai passerait pour une
     * mauvaise raison (revue indépendante de la PR #532).
     */
    private ConnectorConnection anAdminWaitCouldSucceed(String connectorKey) {
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));
        lenient().when(workspaceRepository.getReferenceById(WS_ID)).thenReturn(ws);
        lenient().when(userRepository.findById(USER_ID)).thenReturn(Optional.of(person));
        ConnectorConnection conn = ConnectorConnection.builder().workspace(ws).connectorKey(connectorKey).build();
        lenient().when(workspaceMcp.ownConnection(ws, person, connectorKey, false)).thenReturn(conn);
        return conn;
    }

    @Test
    @DisplayName("callback : la personne refuse elle-même un outil qui exige l'administrateur -> erreur, jamais l'attente de l'administrateur")
    void aDeclineOnAnAdminRequiredToolIsNotAnAdminWait() {
        assertThat(catalog.preset("asana")).hasValueSatisfying(p -> assertThat(p.admin().required()).isTrue());
        McpOAuthState row = openState("st-d");
        row.setConnectorKey("asana");
        when(stateRepository.findById("st-d")).thenReturn(Optional.of(row));
        ConnectorConnection conn = anAdminWaitCouldSucceed("asana");

        assertThat(service.callback("st-d", null, "access_denied", null, "The user denied the request"))
            .contains("mcp=error").contains("connector=asana").doesNotContain("mcp=admin");
        assertThat(conn.getState()).isNotEqualTo(ConnectionState.WAITING_FOR_ADMIN);
        verify(connections, never()).save(any());
    }

    @Test
    @DisplayName("callback : une erreur qui arrive après un retour déjà reçu -> erreur, la connexion n'attend pas l'administrateur")
    void anErrorAfterTheReturnChangesNothing() {
        McpOAuthState row = openState("st-1");
        when(stateRepository.findById("st-1")).thenReturn(Optional.of(row));
        ConnectorConnection conn = anAdminWaitCouldSucceed("linear");
        service.callback("st-1", "code-xyz", null, "https://as.ex");
        String firstFinish = row.getFinishHash();

        assertThat(service.callback("st-1", null, "admin_approval_required")).contains("mcp=error")
            .doesNotContain("mcp=admin");

        assertThat(row.getCode()).isEqualTo("code-xyz");
        assertThat(row.getFinishHash()).isEqualTo(firstFinish);
        assertThat(conn.getState()).isNotEqualTo(ConnectionState.WAITING_FOR_ADMIN);
        verify(connections, never()).save(any());
    }

    @Test
    @DisplayName("callback : un retour en erreur clôt le flux -> un second retour, même une erreur d'administrateur, ne change rien")
    void anErrorReturnClosesTheFlow() {
        McpOAuthState row = openState("st-e");
        when(stateRepository.findById("st-e")).thenReturn(Optional.of(row));
        ConnectorConnection conn = anAdminWaitCouldSucceed("linear");

        assertThat(service.callback("st-e", null, "access_denied")).contains("mcp=error");
        assertThat(row.getCode()).isNull();
        assertThat(row.getFinishHash()).isNotNull(); // clos : personne ne détient le jeton qui le finirait
        assertThat(service.callback("st-e", null, "admin_approval_required")).contains("mcp=error")
            .doesNotContain("mcp=admin");
        assertThat(conn.getState()).isNotEqualTo(ConnectionState.WAITING_FOR_ADMIN);
        verify(connections, never()).save(any());
        assertThat(service.complete(USER_ID, "st-e", "any").outcome()).isEqualTo("error");
        verify(client, never()).postForm(anyString(), any());
    }

    @Test
    @DisplayName("callback : un flux échu revient avec une erreur d'administrateur -> erreur, la connexion n'attend pas l'administrateur")
    void anExpiredFlowIsNeverAnAdminWait() {
        McpOAuthState row = openState("st-x2");
        row.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        when(stateRepository.findById("st-x2")).thenReturn(Optional.of(row));
        ConnectorConnection conn = anAdminWaitCouldSucceed("linear");

        assertThat(service.callback("st-x2", null, "admin_approval_required")).contains("mcp=error")
            .doesNotContain("mcp=admin");
        assertThat(conn.getState()).isNotEqualTo(ConnectionState.WAITING_FOR_ADMIN);
        verify(connections, never()).save(any());
    }

    @Test
    @DisplayName("callback : l'éditeur attend son administrateur -> la connexion le dit, retour admin")
    void callbackWaitingForAdmin() {
        when(stateRepository.findById("st-a")).thenReturn(Optional.of(openState("st-a")));
        when(workspaceRepository.getReferenceById(WS_ID)).thenReturn(ws);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(person));
        ConnectorConnection conn = ConnectorConnection.builder().workspace(ws).connectorKey("linear").build();
        when(workspaceMcp.ownConnection(ws, person, "linear", false)).thenReturn(conn);
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));

        assertThat(service.callback("st-a", null, "admin_approval_required")).contains("mcp=admin");
        assertThat(conn.getState()).isEqualTo(ConnectionState.WAITING_FOR_ADMIN);
        assertThat(conn.getConnectedBy()).isSameAs(person); // une connexion neuve est à la personne qui l'a lancée
        verify(connections).save(conn);
        verify(client, never()).postForm(anyString(), any());
    }

    @Test
    @DisplayName("callback : la connexion de l'espace qui attend son administrateur entre au journal ; la sienne, non")
    void aSharedAdminWaitIsRecorded() {
        anAdminWaitCouldSucceed("linear");
        McpOAuthState own = openState("st-own-a");
        McpOAuthState shared = openState("st-shared-a");
        shared.setShared(true);
        when(stateRepository.findById("st-own-a")).thenReturn(Optional.of(own));
        when(stateRepository.findById("st-shared-a")).thenReturn(Optional.of(shared));
        when(workspaceMcp.ownConnection(ws, person, "linear", true)).thenReturn(ConnectorConnection.builder()
            .workspace(ws).connectorKey("linear").scope(ConnectionScope.WORKSPACE).build());

        assertThat(service.callback("st-own-a", null, "admin_approval_required")).contains("mcp=admin");
        verify(workspaceMcp, never()).recordShared(any(), any(), any(), any());
        assertThat(service.callback("st-shared-a", null, "admin_approval_required")).contains("mcp=admin");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<java.util.Map<String, Object>> details = ArgumentCaptor.forClass(java.util.Map.class);
        verify(workspaceMcp).recordShared(eq(WS_ID), eq(USER_ID), eq("linear"), details.capture());
        assertThat(details.getValue()).containsEntry("change", "waiting-for-admin").containsEntry("host", "203.0.113.10");
    }

    @Test
    @DisplayName("callback : l'administrateur attendu sur une connexion de l'espace déjà gardée -> la personne qui l'a faite reste")
    void anAdminAnswerKeepsWhoMadeTheConnection() {
        McpOAuthState row = openState("st-s");
        row.setShared(true);
        when(stateRepository.findById("st-s")).thenReturn(Optional.of(row));
        when(workspaceRepository.getReferenceById(WS_ID)).thenReturn(ws);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(person));
        User maker = User.builder().id(USER_ID + 1).email("b@acme.test").build();
        ConnectorConnection conn = ConnectorConnection.builder().id(41L).workspace(ws).connectorKey("linear")
            .scope(ConnectionScope.WORKSPACE).connectedBy(maker).config("{}").state(ConnectionState.NEEDS_RECONNECT).build();
        when(workspaceMcp.ownConnection(ws, person, "linear", true)).thenReturn(conn);
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));

        assertThat(service.callback("st-s", null, "admin_approval_required")).contains("mcp=admin");

        assertThat(conn.getState()).isEqualTo(ConnectionState.WAITING_FOR_ADMIN);
        assertThat(conn.getConnectedBy()).isSameAs(maker);
        verify(connections).save(conn);
    }

    @Test
    @DisplayName("callback : l'administrateur attendu sur une connexion à refaire -> seul son état change, ses jetons restent")
    void anAdminAnswerOnAConnectionToRedoChangesOnlyItsState() {
        when(stateRepository.findById("st-r")).thenReturn(Optional.of(openState("st-r")));
        when(workspaceRepository.getReferenceById(WS_ID)).thenReturn(ws);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(person));
        String config = "{\"mcpUrl\":\"https://mcp.linear.app/mcp\",\"mcpOAuthIssuer\":\"https://as.ex\","
            + "\"mcpAccessToken\":\"AT\",\"mcpRefreshToken\":\"RT\",\"mcpRevocationEndpoint\":\"https://as.ex/revoke\"}";
        ConnectorConnection conn = ConnectorConnection.builder().id(40L).workspace(ws).connectorKey("linear")
            .config(config).state(ConnectionState.NEEDS_RECONNECT).build();
        when(workspaceMcp.ownConnection(ws, person, "linear", false)).thenReturn(conn);
        lenient().when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(ws));

        assertThat(service.callback("st-r", null, "admin_approval_required")).contains("mcp=admin");

        assertThat(conn.getState()).isEqualTo(ConnectionState.WAITING_FOR_ADMIN);
        assertThat(conn.getConfig()).isEqualTo(config); // les jetons restent, la déconnexion saura les révoquer
        verify(connections).save(conn);
        verify(tokenService, never()).revoke(any());
    }

    // =========================================================================
    @Test
    @DisplayName("connect : un outil qui exige l'application de l'entreprise -> admin pour un membre, company-app pour un admin")
    void connectWaitsForTheCompanyApp() {
        when(apps.findByWorkspaceIdAndConnectorKey(WS_ID, "slack-mcp")).thenReturn(Optional.empty());
        McpOAuthService.ConnectRequest req = new McpOAuthService.ConnectRequest("slack-mcp", null, null, null, null,
            false, false, false, null);

        McpOAuthService.ConnectOutcome member = service.connect(ws, person, req);
        // Le rôle vient du service lui-même, plus de l'appelant.
        when(authorization.isManager(WS_ID, USER_ID)).thenReturn(true);
        McpOAuthService.ConnectOutcome admin = service.connect(ws, person, req);

        assertThat(member.next()).isEqualTo("admin");
        assertThat(member.message()).contains("http://localhost:8080/api/mcp/oauth/callback").doesNotContain("{redirectUri}");
        assertThat(admin.next()).isEqualTo("company-app");
        verifyNoInteractions(discovery, client);
    }

    @Test
    @DisplayName("connect et start : une connexion partagée demandée par un membre -> refus par le service, rien ne part")
    void aMemberCannotShareAConnection() {
        WorkspaceMemberRepository members = org.mockito.Mockito.mock(WorkspaceMemberRepository.class);
        when(members.findByWorkspaceIdAndUserId(WS_ID, USER_ID))
            .thenReturn(Optional.of(WorkspaceMember.builder().role(WorkspaceRole.MEMBER).build()));
        McpOAuthService guarded = new McpOAuthService(discovery, client, stateRepository, workspaceRepository,
            userRepository, tokenService, workspaceMcp, registrar, settings, catalog, apps, connections, om,
            new AuthorizationService(members));
        McpOAuthService.ConnectRequest shared = new McpOAuthService.ConnectRequest("linear", null, null, null, null,
            true, false, false, null);

        assertThatThrownBy(() -> guarded.connect(ws, person, shared)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> guarded.start(ws, USER_ID, shared, "https://mcp.linear.app/mcp"))
            .isInstanceOf(ForbiddenException.class);
        verifyNoInteractions(discovery, client, registrar, workspaceMcp);
        verify(stateRepository, never()).save(any());
    }

    @Test
    @DisplayName("connect : une fois l'application de l'entreprise saisie, le navigateur s'ouvre")
    void connectOpensTheBrowserOnceTheCompanyAppIsThere() {
        when(apps.findByWorkspaceIdAndConnectorKey(WS_ID, "slack-mcp"))
            .thenReturn(Optional.of(ConnectorApp.builder().clientId("cid").build()));
        when(client.probe("https://mcp.slack.com/mcp")).thenReturn(new McpOAuthClient.Probe(401, ""));
        when(workspaceMcp.resolveServer(WS_ID, "slack-mcp", null)).thenReturn(new ServerIdentity("slack-mcp", null));
        when(discovery.discover("https://mcp.slack.com/mcp")).thenThrow(new McpOAuthDiscovery.NoOAuth("x"));
        service.allowLocalServersForContractTests(); // aucun nom résolu dans l'essai

        McpOAuthService.ConnectOutcome out = service.connect(ws, person,
            new McpOAuthService.ConnectRequest("slack-mcp", null, null, null, null, false, false, false, null));

        // Sans métadonnées OAuth, le serveur attend une clé : la suite le dit.
        assertThat(out.next()).isEqualTo("key");
    }

    @Test
    @DisplayName("connect : un préréglage par clé demande la clé ; la clé donnée se garde pour la personne")
    void connectByKey() {
        McpOAuthService.ConnectOutcome asked = service.connect(ws, person,
            new McpOAuthService.ConnectRequest("excalidraw-plus", null, null, null, null, false, false, false, null));
        assertThat(asked.next()).isEqualTo("key");

        McpOAuthService.ConnectOutcome saved = service.connect(ws, person,
            new McpOAuthService.ConnectRequest("excalidraw-plus", null, null, "k-1", null, false, false, false, null));
        assertThat(saved.next()).isEqualTo("connected");
        ArgumentCaptor<WorkspaceMcpService.ServerRequest> req = ArgumentCaptor.forClass(WorkspaceMcpService.ServerRequest.class);
        verify(workspaceMcp).connectServer(eq(ws), eq(person), req.capture());
        assertThat(req.getValue().mcpUrl()).isEqualTo("https://api.excalidraw.com/api/v1/mcp");
        assertThat(req.getValue().token()).isEqualTo("k-1");
        assertThat(req.getValue().shared()).isFalse();
    }

    @Test
    @DisplayName("connect : l'adresse du serveur que l'entreprise crée (Zoho) est demandée, puis vaut la connexion")
    void connectByServerUrl() {
        assertThat(service.connect(ws, person, new McpOAuthService.ConnectRequest("zoho", null, null, null, null,
            false, false, false, null)).next()).isEqualTo("key");
    }

    @Test
    @DisplayName("connect : un serveur public se connecte tel quel, sans navigateur")
    void connectAnOpenServer() {
        assertThat(service.connect(ws, person, new McpOAuthService.ConnectRequest("excalidraw", null, null, null,
            null, false, false, false, null)).next()).isEqualTo("connected");
        verify(workspaceMcp).connectServer(eq(ws), eq(person), any());
        verifyNoInteractions(discovery);
    }

    @Test
    @DisplayName("connect : un serveur local sans l'accord de la personne -> la suite le lui demande")
    void connectALocalServerAsksFirst() {
        when(workspaceMcp.connectServer(eq(ws), eq(person), any()))
            .thenThrow(new WorkspaceMcpService.LocalServerNeedsApproval("127.0.0.1:8811"));

        McpOAuthService.ConnectOutcome out = service.connect(ws, person, new McpOAuthService.ConnectRequest(
            "custom", "Docker", "http://127.0.0.1:8811/mcp", null, null, false, false, false, null));

        assertThat(out.next()).isEqualTo("local");
        assertThat(out.message()).contains("127.0.0.1:8811");
    }

    @Test
    @DisplayName("accountLabel : le jeton d'identité, puis les champs courants ; nul quand l'éditeur ne dit rien")
    void accountLabel() throws Exception {
        String claims = java.util.Base64.getUrlEncoder().withoutPadding()
            .encodeToString("{\"email\":\"ada@acme.test\"}".getBytes());
        assertThat(service.accountLabel(om.readTree("{\"id_token\":\"h." + claims + ".s\"}"))).isEqualTo("ada@acme.test");
        assertThat(service.accountLabel(om.readTree("{\"authed_user\":{\"name\":\"Ada\"}}"))).isEqualTo("Ada");
        assertThat(service.accountLabel(om.readTree("{\"workspace_name\":\"Acme\"}"))).isEqualTo("Acme");
        assertThat(service.accountLabel(om.readTree("{\"access_token\":\"AT\"}"))).isNull();
    }
}
