package com.taskforce.tf_api.core.service.mcp;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.ConnectionScope;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.McpOAuthState;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.repository.McpOAuthRegistrationRepository;
import com.taskforce.tf_api.core.repository.McpOAuthStateRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;
import com.taskforce.tf_api.core.service.agent.CortexGate;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;
import com.taskforce.tf_api.modules.storage.domain.StorageKind;
import com.taskforce.tf_api.modules.storage.domain.StorageTarget;
import com.taskforce.tf_api.modules.storage.service.CompanyStorageAccess;
import com.taskforce.tf_api.modules.storage.service.DocumentWriter;
import com.taskforce.tf_api.modules.storage.service.GoogleDriveDocumentWriter;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

/**
 * Essais de contrat des fichiers de l'entreprise (TF-J2-14, la part fichiers de TF-J2-5 ; séance n°22, R154 à R156 et
 * R158), sans les comptes de la Présidence : les vrais services de TaskForce contre de faux éditeurs sur 127.0.0.1. Ils
 * jouent la connexion par la même voie que les serveurs MCP (le geste « Connect », PKCE S256, le retour, une connexion
 * par personne), la lecture en direct citée avec sa fiche et comptée comme un contenu du dehors, et le rangement dans le
 * dossier choisi.
 */
@DisplayName("Contrat des fichiers de l'entreprise (faux éditeurs locaux)")
class CompanyFilesContractTest {

    private static final long WS = 1L;

    private final ObjectMapper om = new ObjectMapper();
    private final Workspace ws = Workspace.builder().id(WS).slug("acme").build();
    private final User ada = User.builder().id(7L).email("ada@acme.test").build();
    private final User bob = User.builder().id(8L).email("bob@acme.test").build();

    private FakeGoogle google;
    private final List<ConnectorConnection> rows = new ArrayList<>();
    private final Map<String, McpOAuthState> states = new ConcurrentHashMap<>();
    private final AtomicLong ids = new AtomicLong(100);
    private final MockEnvironment env = new MockEnvironment();
    private final AuthorizationService authorization = Mockito.mock(AuthorizationService.class);

    private ConnectorCatalog catalog;
    private McpTokenService tokens;
    private WorkspaceMcpService workspaceMcp;
    private CompanyConnections connections;
    private GoogleDriveApi drive;
    private McpOAuthService oauth;

    @BeforeEach
    void start() throws Exception {
        google = new FakeGoogle();
        catalog = new ConnectorCatalog();
        catalog.build();
        env.setProperty("TF_GOOGLE_CLIENT_ID", FakeGoogle.CLIENT_ID);
        env.setProperty("TF_GOOGLE_CLIENT_SECRET", FakeGoogle.CLIENT_SECRET);
        oauth = services();
    }

    @AfterEach
    void stop() {
        google.close();
    }

    // ── Le montage des vrais services ────────────────────────────────────────

    private McpOAuthService services() {
        McpOAuthClient http = new McpOAuthClient(om, 5000, true);
        McpClient mcp = new McpClient(om, 2000, 5000, true);
        ConnectorConnectionRepository repo = connections();
        tokens = new McpTokenService(http, repo, om);
        workspaceMcp = new WorkspaceMcpService(repo, mcp, om, tokens, catalog);
        ReflectionTestUtils.setField(workspaceMcp, "cacheTtlMs", 0L);
        CompanyApiHttp api = new CompanyApiHttp(om, true);
        drive = new GoogleDriveApi(api);
        connections = new CompanyConnections(repo, tokens, om);
        workspaceMcp.setApiTools(new CompanyApiTools(om, catalog, connections, drive));
        McpOAuthSettings settings = new McpOAuthSettings("http://127.0.0.1:8080", "", "http://app.test", "TaskForce",
            "web", "");
        McpClientRegistrar registrar = new McpClientRegistrar(apps(), Mockito.mock(McpOAuthRegistrationRepository.class),
            http, settings, env);
        UserRepository users = Mockito.mock(UserRepository.class);
        lenient().when(users.findById(7L)).thenReturn(Optional.of(ada));
        lenient().when(users.findById(8L)).thenReturn(Optional.of(bob));
        McpOAuthService service = new McpOAuthService(new McpOAuthDiscovery(http), http, stateRepository(),
            workspaceRepository(), users, tokens, workspaceMcp, registrar, settings, catalog, apps(), repo, om);
        service.allowLocalServersForContractTests();
        service.pointApiForContractTests("google-drive", google.base(), google.base());
        return service;
    }

    /** Le geste « Connect » de Google Drive : le navigateur chez Google, l'accord, le retour. */
    private String connectGoogle(User person) {
        McpOAuthService.ConnectOutcome outcome = oauth.connect(ws, person, false, new McpOAuthService.ConnectRequest(
            "google-drive", null, null, null, null, false, false, false, null));
        assertThat(outcome.next()).isEqualTo("browser");
        Map<String, String> back = google.approve(outcome.authorizeUrl());
        return oauth.callback(back.get("state"), back.get("code"), null, null);
    }

    private List<AgentTool> toolsOf(User person) {
        return workspaceMcp.toolsFor(new AgentContext("acme", WS, person.getId()));
    }

    private AgentTool tool(User person, String name) {
        return toolsOf(person).stream().filter(t -> t.name().equals(name)).findFirst().orElseThrow();
    }

    // ── Google Drive : se connecter ──────────────────────────────────────────

    @Test
    @DisplayName("Google Drive se connecte par notre application : PKCE S256, drive.file, le jeton de renouvellement, sans resource")
    void googleConnects() {
        McpOAuthService.ConnectOutcome outcome = oauth.connect(ws, ada, false, new McpOAuthService.ConnectRequest(
            "google-drive", null, null, null, null, false, false, false, null));
        Map<String, String> q = FakeGoogle.query(java.net.URI.create(outcome.authorizeUrl()).getRawQuery());
        assertThat(outcome.authorizeUrl()).startsWith(google.base() + "/o/oauth2/v2/auth?");
        assertThat(q).containsEntry("client_id", FakeGoogle.CLIENT_ID).containsEntry("code_challenge_method", "S256")
            .containsEntry("access_type", "offline").containsEntry("prompt", "consent")
            .containsEntry("scope", "openid email https://www.googleapis.com/auth/drive.file")
            .containsEntry("redirect_uri", "http://127.0.0.1:8080/api/mcp/oauth/callback")
            .doesNotContainKey("resource");

        Map<String, String> back = google.approve(outcome.authorizeUrl());
        String redirect = oauth.callback(back.get("state"), back.get("code"), null, null);

        assertThat(redirect).contains("mcp=connected").contains("connector=google-drive");
        ConnectorConnection conn = rows.get(0);
        assertThat(conn.getScope()).isEqualTo(ConnectionScope.PERSONAL);
        assertThat(conn.isOwnedBy(ada.getId())).isTrue();
        assertThat(conn.getAccountLabel()).isEqualTo("ada@acme.example");
        assertThat(conn.getConfig()).contains("\"apiKind\":\"google-drive\"").contains("drive.file");
        assertThat(google.tokenRequests).singleElement().satisfies(f -> assertThat(f)
            .containsKeys("code_verifier", "client_secret").doesNotContainKey("resource"));
    }

    @Test
    @DisplayName("sans notre application sur l'instance : l'étape de l'administrateur, ou l'application de l'entreprise")
    void withoutOurAppTheAdminActsFirst() {
        env.setProperty("TF_GOOGLE_CLIENT_ID", "");
        McpOAuthService.ConnectOutcome member = oauth.connect(ws, bob, false, new McpOAuthService.ConnectRequest(
            "google-drive", null, null, null, null, false, false, false, null));
        McpOAuthService.ConnectOutcome manager = oauth.connect(ws, ada, true, new McpOAuthService.ConnectRequest(
            "google-drive", null, null, null, null, false, false, false, null));
        assertThat(member.next()).isEqualTo("admin");
        assertThat(manager.next()).isEqualTo("company-app");
    }

    // ── Google Drive : lire en direct (R155) ─────────────────────────────────

    @Test
    @DisplayName("Cortex lit un document en direct, cité avec sa version, son responsable et sa date, comme un contenu du dehors")
    void cortexReadsLive() {
        String doc = google.addDoc("Q4 plan", "Revenue target: 1.2 M", "Grace Hopper", "42");
        connectGoogle(ada);

        assertThat(toolsOf(ada)).extracting(AgentTool::name)
            .contains("google-drive__search_files", "google-drive__read_file");
        AgentTool search = tool(ada, "google-drive__search_files");
        AgentTool read = tool(ada, "google-drive__read_file");
        assertThat(CortexGate.facts(read)).containsEntry("action", "mcp.read").containsEntry("server", "google-drive");

        String found = search.execute(Map.of("query", "Revenue"), new AgentContext("acme", WS, ada.getId()));
        assertThat(found).contains("\"Q4 plan\" (id " + doc + ")").contains("owner Grace Hopper").contains("version 42");

        String text = read.execute(Map.of("fileId", doc), new AgentContext("acme", WS, ada.getId()));
        assertThat(text).startsWith("Source: \"Q4 plan\" in Google Drive, version 42, owner Grace Hopper, "
            + "last changed 2026-11-10 14:02 UTC by Grace Hopper. Read live ")
            .contains("Link: https://docs.example/" + doc).contains(CompanyApiTools.OUTSIDE)
            .endsWith("Revenue target: 1.2 M");

        // Lu, c'est un contenu du dehors, et des données de l'entreprise (R158).
        CortexGate.Exposure exposure = CortexGate.Exposure.none();
        exposure.after(read, CortexGate.facts(read), "success");
        assertThat(exposure.untrusted()).isTrue();
        assertThat(exposure.sensitive()).isTrue();
    }

    @Test
    @DisplayName("les droits suivent la personne : Bob ne lit jamais par la connexion d'Ada")
    void rightsFollowThePerson() {
        connectGoogle(ada);
        assertThat(toolsOf(bob)).extracting(AgentTool::name).noneMatch(n -> n.startsWith("google-drive__"));
    }

    @Test
    @DisplayName("un identifiant qui n'est pas celui d'un fichier de Drive est refusé avant tout appel")
    void unsafeIdRefused() {
        connectGoogle(ada);
        AgentTool read = tool(ada, "google-drive__read_file");
        assertThatThrownBy(() -> read.execute(Map.of("fileId", "../../admin"), new AgentContext("acme", WS, ada.getId())))
            .isInstanceOf(BusinessException.class);
    }

    // ── Google Drive : ranger dans le dossier choisi (R156) ──────────────────

    @Test
    @DisplayName("le document arrive dans le dossier choisi, par la connexion de la personne, avec son lien et sa version")
    void savesInTheChosenFolder() {
        String folder = google.addFolder("Reports", true);
        String locked = google.addFolder("Read only", false);
        connectGoogle(ada);
        GoogleDriveDocumentWriter writer = new GoogleDriveDocumentWriter(new CompanyStorageAccess(connections, authorization),
            connections, drive);

        assertThat(writer.readiness(WS, ada.getId())).isEqualTo("ready");
        assertThat(writer.readiness(WS, bob.getId())).isEqualTo("connect");
        StorageTarget checked = writer.check(WS, ada.getId(), StorageTarget.builder().kind(StorageKind.GOOGLE_DRIVE)
            .folderId(folder).build());
        assertThat(checked.getFolderName()).isEqualTo("Reports");
        assertThatThrownBy(() -> writer.check(WS, ada.getId(), StorageTarget.builder().kind(StorageKind.GOOGLE_DRIVE)
            .folderId(locked).build())).isInstanceOf(BusinessException.class).hasMessageContaining("can't add files");

        DocumentWriter.Written written = writer.write(WS, ada.getId(), checked,
            DocumentWriter.DocumentFile.markdown("Weekly report", "# Week 46\n"));

        assertThat(written.version()).isEqualTo("1");
        assertThat(written.webUrl()).startsWith("https://drive.example/file/");
        assertThat(google.uploadedIn(folder)).containsEntry("Weekly report.md", "# Week 46\n");
        assertThatThrownBy(() -> writer.write(WS, bob.getId(), checked,
            DocumentWriter.DocumentFile.markdown("x", "y"))).isInstanceOf(BusinessException.class)
            .hasMessageContaining("Connect Google Drive first");
    }

    @Test
    @DisplayName("déconnecter révoque chez Google")
    void disconnectRevokes() {
        connectGoogle(ada);
        WorkspaceMcpService.DisconnectResult result = workspaceMcp.disconnectServer(WS, ada.getId(), "google-drive", false);
        assertThat(result.revoked()).isTrue();
        assertThat(google.revoked).contains("google-refresh");
        assertThat(rows).isEmpty();
    }

    // ── Les dépôts en mémoire ────────────────────────────────────────────────

    private ConnectorConnectionRepository connections() {
        ConnectorConnectionRepository repo = Mockito.mock(ConnectorConnectionRepository.class);
        lenient().when(repo.findUsable(anyLong(), anyLong())).thenAnswer(inv -> rows.stream()
            .filter(r -> r.getOwner() == null || Objects.equals(r.getOwner().getId(), inv.getArgument(1))).toList());
        lenient().when(repo.findAll()).thenAnswer(inv -> List.copyOf(rows));
        lenient().when(repo.findById(anyLong())).thenAnswer(inv -> rows.stream()
            .filter(r -> r.getId().equals(inv.getArgument(0))).findFirst());
        lenient().when(repo.findByWorkspaceIdAndConnectorKeyAndOwnerId(anyLong(), anyString(), anyLong())).thenAnswer(inv ->
            rows.stream().filter(r -> r.getConnectorKey().equals(inv.getArgument(1)) && r.getOwner() != null
                && r.getOwner().getId().equals(inv.getArgument(2))).findFirst());
        lenient().when(repo.findByWorkspaceIdAndConnectorKeyAndOwnerIsNull(anyLong(), anyString())).thenAnswer(inv ->
            rows.stream().filter(r -> r.getConnectorKey().equals(inv.getArgument(1)) && r.getOwner() == null).findFirst());
        lenient().when(repo.save(any())).thenAnswer(inv -> {
            ConnectorConnection c = inv.getArgument(0);
            if (c.getId() == null) c.setId(ids.incrementAndGet());
            if (!rows.contains(c)) rows.add(c);
            return c;
        });
        lenient().doAnswer(inv -> rows.remove((ConnectorConnection) inv.getArgument(0))).when(repo).delete(any());
        return repo;
    }

    private McpOAuthStateRepository stateRepository() {
        McpOAuthStateRepository repo = Mockito.mock(McpOAuthStateRepository.class);
        lenient().when(repo.save(any())).thenAnswer(inv -> {
            McpOAuthState s = inv.getArgument(0);
            states.put(s.getState(), s);
            return s;
        });
        lenient().when(repo.findById(anyString())).thenAnswer(inv -> Optional.ofNullable(states.get((String) inv.getArgument(0))));
        lenient().doAnswer(inv -> states.remove((String) inv.getArgument(0))).when(repo).deleteById(anyString());
        return repo;
    }

    private ConnectorAppRepository apps() {
        ConnectorAppRepository repo = Mockito.mock(ConnectorAppRepository.class);
        lenient().when(repo.findByWorkspaceIdAndConnectorKey(anyLong(), anyString())).thenReturn(Optional.empty());
        return repo;
    }

    private WorkspaceRepository workspaceRepository() {
        WorkspaceRepository repo = Mockito.mock(WorkspaceRepository.class);
        lenient().when(repo.findById(WS)).thenReturn(Optional.of(ws));
        lenient().when(repo.getReferenceById(WS)).thenReturn(ws);
        return repo;
    }
}
