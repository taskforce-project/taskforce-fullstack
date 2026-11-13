package com.taskforce.tf_api.core.service.mcp;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.env.MockEnvironment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.repository.McpOAuthRegistrationRepository;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;
import com.taskforce.tf_api.core.service.mcp.McpOAuthDiscovery.DiscoveredAuth;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.RefusedRequestException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Chaque échec d'une connexion à un outil porte un code stable (revue des écrans de J2, séance n°23, R160) : l'écran
 * dit la cause en mots d'après ce code, et ne lit jamais le texte du serveur, gardé tel quel à deux clics.
 */
@DisplayName("ConnectFailure : la raison de chaque échec de connexion")
class ConnectFailureTest {

    private final ObjectMapper om = new ObjectMapper();
    private HttpServer vendor;

    @AfterEach
    void stop() {
        if (vendor != null) vendor.stop(0);
    }

    private static String code(Throwable thrown) {
        assertThat(thrown).isInstanceOf(BusinessException.class);
        return ((BusinessException) thrown).getErrorCode();
    }

    @Test
    @DisplayName("une adresse du réseau interne, ou qui n'est pas web : ADDRESS_NOT_ALLOWED, le texte brut gardé")
    void anInternalAddress() {
        Throwable internal = catchThrowable(
            () -> ConnectFailure.assertPublicAddress("http://127.0.0.1:8080/mcp"));
        assertThat(code(internal)).isEqualTo(ConnectFailure.ADDRESS_NOT_ALLOWED);
        assertThat(internal).hasMessageContaining("internal address");
        assertThat(code(catchThrowable(
            () -> ConnectFailure.assertPublicAddress("ftp://files.example/x")))).isEqualTo(ConnectFailure.ADDRESS_NOT_ALLOWED);
        assertThat(code(catchThrowable(
            () -> new McpClient(om, 2000L, 5000L, false).assertAllowed("http://10.0.0.5/mcp"))))
            .isEqualTo(ConnectFailure.ADDRESS_NOT_ALLOWED);
    }

    @Test
    @DisplayName("les refus de la garde des adresses, la saisie comme celle de l'éditeur, se journalisent en WARN (R159)")
    void theGuardRefusalsAreExpected() {
        assertThat(catchThrowable(() -> ConnectFailure.assertPublicAddress("http://169.254.169.254/latest")))
            .isInstanceOf(RefusedRequestException.class);
        assertThat(catchThrowable(() -> ConnectFailure.assertVendorAddress("http://10.0.0.1/authorize")))
            .isInstanceOf(RefusedRequestException.class);
        assertThat(catchThrowable(() -> new McpOAuthClient(om, 2000L).postJson("http://127.0.0.1:9/register", Map.of())))
            .isInstanceOf(RefusedRequestException.class);
        assertThat(catchThrowable(() -> new McpClient(om, 2000L, 5000L, false).assertAllowed("http://127.0.0.1:9/mcp")))
            .isInstanceOf(RefusedRequestException.class);
    }

    @Test
    @DisplayName("une autre adresse que le serveur officiel d'un préréglage : OFFICIAL_SERVER_ONLY")
    void notTheOfficialServer() {
        ConnectorCatalog catalog = new ConnectorCatalog();
        catalog.build();

        assertThat(code(catchThrowable(
            () -> catalog.serverFor("linear", "https://evil.example/mcp", false)))).isEqualTo(ConnectFailure.OFFICIAL_SERVER_ONLY);
        assertThat(code(catchThrowable(
            () -> catalog.assertAddress("google-drive", "https://drive.example/mcp")))).isEqualTo(ConnectFailure.OFFICIAL_SERVER_ONLY);
    }

    @Test
    @DisplayName("la découverte : sans OAuth, un émetteur qui ment, un autre serveur, sans PKCE ni adresses complètes")
    void theDiscovery() throws Exception {
        McpOAuthClient client = Mockito.mock(McpOAuthClient.class);
        McpOAuthDiscovery discovery = new McpOAuthDiscovery(client);
        lenient().when(client.probeWwwAuthenticate(anyString())).thenReturn(null);
        lenient().when(client.getJsonOrNull(anyString())).thenReturn(null);

        assertThat(code(catchThrowable(() -> discovery.discover("https://mcp.ex/mcp"))))
            .isEqualTo(ConnectFailure.NO_SIGN_IN);

        String as = "{\"issuer\":\"https://other.ex\",\"authorization_endpoint\":\"https://mcp.ex/a\","
            + "\"token_endpoint\":\"https://mcp.ex/t\",\"code_challenge_methods_supported\":[\"S256\"]}";
        when(client.getJsonOrNull("https://mcp.ex/.well-known/oauth-authorization-server")).thenReturn(om.readTree(as));
        assertThat(code(catchThrowable(() -> discovery.discover("https://mcp.ex/mcp"))))
            .isEqualTo(ConnectFailure.SIGN_IN_UNTRUSTED);

        when(client.getJsonOrNull("https://mcp.ex/.well-known/oauth-authorization-server"))
            .thenReturn(om.readTree(as.replace("https://other.ex", "https://mcp.ex").replace("[\"S256\"]", "[\"plain\"]")));
        assertThat(code(catchThrowable(() -> discovery.discover("https://mcp.ex/mcp"))))
            .isEqualTo(ConnectFailure.SIGN_IN_UNSUPPORTED);

        when(client.getJsonOrNull("https://mcp.ex/.well-known/oauth-authorization-server"))
            .thenReturn(om.readTree("{\"issuer\":\"https://mcp.ex\",\"authorization_endpoint\":\"https://mcp.ex/a\"}"));
        assertThat(code(catchThrowable(() -> discovery.discover("https://mcp.ex/mcp"))))
            .isEqualTo(ConnectFailure.SIGN_IN_UNSUPPORTED);

        assertThat(code(catchThrowable(
            () -> McpOAuthDiscovery.resource(om.readTree("{\"resource\":\"https://evil.ex/mcp\"}"), "https://mcp.ex/mcp"))))
            .isEqualTo(ConnectFailure.SIGN_IN_UNTRUSTED);
    }

    @Test
    @DisplayName("l'inscription refusée par l'éditeur : REGISTRATION_REFUSED, avec son erreur OAuth dans le texte brut")
    void theVendorRefusesTheRegistration() throws IOException {
        vendor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        vendor.createContext("/register", exchange -> {
            byte[] body = "{\"error\":\"invalid_redirect_uri\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(400, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        vendor.start();
        McpOAuthClient client = new McpOAuthClient(om, 5000L, true);
        String url = "http://127.0.0.1:" + vendor.getAddress().getPort() + "/register";

        BusinessException refused = (BusinessException) catchThrowable(() -> client.postJson(url, Map.of()));

        assertThat(refused.getErrorCode()).isEqualTo(ConnectFailure.REGISTRATION_REFUSED);
        assertThat(refused).hasMessageContaining("invalid_redirect_uri").hasMessageContaining("HTTP 400");
    }

    @Test
    @DisplayName("une inscription en panne chez l'éditeur (5xx) ne répond pas, elle ne refuse rien : SIGN_IN_UNREACHABLE (R159)")
    void aRegistrationThatFailsAtTheVendor() throws IOException {
        vendor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        vendor.createContext("/register", exchange -> {
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        vendor.start();
        String url = "http://127.0.0.1:" + vendor.getAddress().getPort() + "/register";

        BusinessException down = (BusinessException) catchThrowable(() -> new McpOAuthClient(om, 5000L, true).postJson(url, Map.of()));

        assertThat(down.getErrorCode()).isEqualTo(ConnectFailure.SIGN_IN_UNREACHABLE);
        assertThat(down).hasMessageContaining("HTTP 503");
    }

    @Test
    @DisplayName("une adresse de l'éditeur que la garde refuse : sa connexion n'est pas sûre (SIGN_IN_UNTRUSTED), pas l'adresse saisie (R159)")
    void aVendorAddressThatTheGuardRefuses() {
        assertThat(code(catchThrowable(() -> ConnectFailure.assertVendorAddress("http://169.254.169.254/authorize"))))
            .isEqualTo(ConnectFailure.SIGN_IN_UNTRUSTED);
        assertThat(code(catchThrowable(
            () -> new McpOAuthClient(om, 2000L).postForm("http://127.0.0.1:9/token", Map.of("grant_type", "x")))))
            .isEqualTo(ConnectFailure.SIGN_IN_UNTRUSTED);
    }

    @Test
    @DisplayName("un serveur de connexion qui ne répond pas : SIGN_IN_UNREACHABLE ; une adresse d'inscription interne : SIGN_IN_UNTRUSTED")
    void anUnreachableSignIn() throws IOException {
        int closed;
        try (ServerSocket socket = new ServerSocket(0)) {
            closed = socket.getLocalPort();
        }
        BusinessException unreachable = (BusinessException) catchThrowable(
            () -> new McpOAuthClient(om, 2000L, true).postJson("http://127.0.0.1:" + closed + "/register", Map.of()));
        assertThat(unreachable.getErrorCode()).isEqualTo(ConnectFailure.SIGN_IN_UNREACHABLE);
        assertThat(unreachable).hasMessageContaining("failed").hasMessageNotContaining("echoue");

        // L'adresse d'inscription vient des métadonnées de l'éditeur : refusée, c'est sa connexion qui n'est pas sûre.
        assertThat(code(catchThrowable(
            () -> new McpOAuthClient(om, 2000L).postJson("http://127.0.0.1:" + closed + "/register", Map.of()))))
            .isEqualTo(ConnectFailure.SIGN_IN_UNTRUSTED);
    }

    @Test
    @DisplayName("sans client possible, un en-tête qui ne porte pas le jeton, un serveur local à accorder : chacun son code")
    void theOtherKnownCauses() {
        McpOAuthSettings settings = new McpOAuthSettings("https://api.example.test", "", "https://app.example.test",
            "TaskForce", "web", "");
        McpClientRegistrar registrar = new McpClientRegistrar(Mockito.mock(ConnectorAppRepository.class),
            Mockito.mock(McpOAuthRegistrationRepository.class), Mockito.mock(McpOAuthClient.class), settings,
            new MockEnvironment());
        DiscoveredAuth noRegistration = new DiscoveredAuth("https://as.ex", "https://as.ex/a", "https://as.ex/t", null, null);

        assertThat(code(catchThrowable(() -> registrar.clientFor(1L, "custom-docs", noRegistration,
            "https://api.example.test/cb", false, false)))).isEqualTo(ConnectFailure.NO_CLIENT);
        assertThat(code(catchThrowable(() -> registrar.clientForApi(1L, "google-drive", "TF_GOOGLE"))))
            .isEqualTo(ConnectFailure.NO_CLIENT);
        assertThat(code(catchThrowable(() -> WorkspaceMcpService.checkTokenHeader("Host", "t-1"))))
            .isEqualTo(ConnectFailure.HEADER_NOT_ALLOWED);
        assertThat(code(catchThrowable(() -> WorkspaceMcpService.checkTokenHeader("X API Key", "t-1"))))
            .isEqualTo(ConnectFailure.HEADER_NOT_ALLOWED);
        assertThat(code(catchThrowable(() -> WorkspaceMcpService.checkTokenHeader("X-API-Key", ""))))
            .isEqualTo(ConnectFailure.HEADER_NOT_ALLOWED);
        WorkspaceMcpService.checkTokenHeader("X-API-Key", "t-1");
        WorkspaceMcpService.checkTokenHeader("", "");
        assertThat(new WorkspaceMcpService.LocalServerNeedsApproval("printer.local").getErrorCode())
            .isEqualTo(ConnectFailure.LOCAL_NEEDS_APPROVAL);
    }

    @Test
    @DisplayName("une inscription qui ne rend pas d'identifiant : REGISTRATION_REFUSED")
    void aRegistrationWithoutClientId() {
        McpOAuthClient client = Mockito.mock(McpOAuthClient.class);
        when(client.postJson(anyString(), any())).thenReturn(om.createObjectNode());
        McpOAuthRegistrationRepository registrations = Mockito.mock(McpOAuthRegistrationRepository.class);
        when(registrations.findByIssuerAndRedirectUri(anyString(), anyString())).thenReturn(Optional.empty());
        McpOAuthSettings settings = new McpOAuthSettings("https://api.example.test", "", "https://app.example.test",
            "TaskForce", "web", "");
        McpClientRegistrar registrar = new McpClientRegistrar(Mockito.mock(ConnectorAppRepository.class), registrations,
            client, settings, new MockEnvironment());
        DiscoveredAuth auth = new DiscoveredAuth("https://as.ex", "https://as.ex/a", "https://as.ex/t", "https://as.ex/r", null);

        assertThatThrownBy(() -> registrar.clientFor(1L, "custom-docs", auth, "https://api.example.test/cb", false, false))
            .isInstanceOf(BusinessException.class)
            .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ConnectFailure.REGISTRATION_REFUSED));
    }
}
