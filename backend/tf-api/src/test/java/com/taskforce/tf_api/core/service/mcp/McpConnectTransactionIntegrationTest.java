package com.taskforce.tf_api.core.service.mcp;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.AopTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.AuditService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;
import com.taskforce.tf_api.core.service.mcp.McpOAuthDiscovery.DiscoveredAuth;
import com.taskforce.tf_api.core.service.mcp.McpOAuthService.ConnectOutcome;
import com.taskforce.tf_api.core.service.mcp.McpOAuthService.ConnectRequest;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Une connexion qui échoue dit pourquoi, et quoi faire (R204, recette de la 1.17.0) : à travers la vraie frontière
 * transactionnelle, les vrais services Spring sur une vraie base. Le 16 et le 17/11/2026, Google Drive, Microsoft, Dropbox,
 * Asana, HubSpot, Xero et DocuSign disaient « wasn't connected, and TaskForce can't tell why » : {@code McpClientRegistrar}
 * levait {@code NoClient} dans la transaction de {@code connect}, qui l'attrapait pour montrer l'étape de l'administrateur,
 * mais la transaction était déjà marquée pour l'annulation, et son commit levait {@code UnexpectedRollbackException}
 * (journal du backend, 17/11/2026 à 10:20:19 et 10:20:21). Dropbox refusait aussi l'inscription automatique
 * (« registration_not_supported », 16/11 à 19:29).
 *
 * <p>Les essais de contrat ({@code McpConnectContractTest}) jouent l'éditeur sans Spring : la transaction n'y était pas.
 * Ici, aucune transaction de test n'entoure l'appel ({@code NOT_SUPPORTED}) : {@code connect} ouvre la sienne et la
 * valide, comme sous la requête de l'app. Seuls l'éditeur et le réseau sont simulés.</p>
 */
@DisplayName("Une connexion qui échoue dit pourquoi, à travers la vraie transaction (R204)")
@Import({McpOAuthService.class, McpClientRegistrar.class, McpOAuthSettings.class, ConnectorCatalog.class,
    WorkspaceMcpService.class, McpConnectTransactionIntegrationTest.Json.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class McpConnectTransactionIntegrationTest extends AbstractIntegrationTest {

    @TestConfiguration
    static class Json {
        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }
    }

    @Autowired private McpOAuthService oauth;

    @MockitoBean private McpOAuthDiscovery discovery;
    @MockitoBean private McpOAuthClient http;
    @MockitoBean private McpTokenService tokens;
    @MockitoBean private McpClient mcp;
    @MockitoBean private AuthorizationService authorization;
    @MockitoBean private AuditService audit;

    /** Ni l'espace ni la personne ne s'écrivent : le chemin de la connexion ne les relit pas. */
    private final Workspace ws = Workspace.builder().id(900_001L).slug("recette").name("Recette").build();
    private final User person = User.builder().id(900_002L).email("presidence@recette.test").build();

    @BeforeEach
    void noRealNetwork() {
        // Les adresses des éditeurs ne se résolvent pas ici : la garde du réseau n'est pas ce que l'essai regarde.
        McpOAuthService target = AopTestUtils.getTargetObject(oauth);
        target.allowLocalServersForContractTests();
        when(http.probe(anyString())).thenReturn(new McpOAuthClient.Probe(401, "Bearer"));
    }

    private ConnectOutcome connect(String key) {
        return oauth.connect(ws, person, new ConnectRequest(key, null, null, null, null, false, false, false, null));
    }

    @Test
    @DisplayName("Asana sans application enregistrée : l'étape de l'administrateur, avec le texte du préréglage")
    void a_tool_without_an_app_shows_the_admin_step() {
        when(discovery.discover(anyString())).thenReturn(new DiscoveredAuth("https://app.asana.com",
            "https://app.asana.com/-/oauth_authorize", "https://app.asana.com/-/oauth_token", null, null));

        ConnectOutcome outcome = connect("asana");

        assertThat(outcome.next()).isEqualTo("admin");
        assertThat(outcome.message()).startsWith("Register an MCP app in the Asana developer console");
    }

    @Test
    @DisplayName("Dropbox refuse l'inscription automatique : la même étape de l'administrateur, pas une erreur")
    void a_vendor_that_refuses_registration_leads_to_the_admin_step() {
        when(discovery.discover(anyString())).thenReturn(new DiscoveredAuth("https://www.dropbox.com",
            "https://www.dropbox.com/oauth2/authorize", "https://api.dropboxapi.com/oauth2/token",
            "https://www.dropbox.com/oauth2/register", null));
        when(http.postJson(anyString(), any())).thenThrow(ConnectFailure.of(ConnectFailure.REGISTRATION_REFUSED,
            "OAuth DCR https://www.dropbox.com/oauth2/register : HTTP 403 (registration_not_supported)"));

        ConnectOutcome outcome = connect("dropbox");

        assertThat(outcome.next()).isEqualTo("admin");
        assertThat(outcome.message()).startsWith("Create a Dropbox app in the App Console");
    }

    @Test
    @DisplayName("Google Drive sans l'application de TaskForce sur l'instance : l'étape de l'administrateur")
    void a_vendor_api_without_an_app_shows_the_admin_step() {
        when(discovery.discoverIssuer(anyString())).thenReturn(new DiscoveredAuth("https://accounts.google.com",
            "https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token", null, null));

        ConnectOutcome outcome = connect("google-drive");

        assertThat(outcome.next()).isEqualTo("admin");
        assertThat(outcome.message()).isEqualTo("This tool needs an app registered by your admin before anyone can connect.");
    }

    @Test
    @DisplayName("un serveur sur la machine : l'accord de la personne est demandé, pas une erreur")
    void a_local_server_asks_for_the_person_s_approval() {
        ConnectOutcome outcome = oauth.connect(ws, person, new ConnectRequest(WorkspaceMcpService.NEW_CUSTOM_KEY, "Mon serveur",
            "http://127.0.0.1:47999/mcp", null, null, false, false, false, null));

        assertThat(outcome.next()).isEqualTo("local");
        assertThat(outcome.message()).startsWith("This server runs on your computer or your local network");
    }
}
