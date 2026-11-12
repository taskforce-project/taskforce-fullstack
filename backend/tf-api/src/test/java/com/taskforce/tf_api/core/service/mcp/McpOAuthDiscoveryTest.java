package com.taskforce.tf_api.core.service.mcp;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.service.mcp.McpOAuthDiscovery.DiscoveredAuth;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires - {@link McpOAuthDiscovery} (TF-MCP-02, norme MCP du 28/07/2026) : résolution des endpoints OAuth
 * depuis la metadata d'un serveur MCP (mockée via {@link McpOAuthClient}), avec l'insertion du chemin de l'émetteur,
 * la vérification de l'émetteur et de PKCE, et l'identifiant du serveur.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("McpOAuthDiscovery")
class McpOAuthDiscoveryTest {

    @Mock private McpOAuthClient client;
    @InjectMocks private McpOAuthDiscovery discovery;

    private final ObjectMapper om = new ObjectMapper();

    private static final String AS = "{\"issuer\":\"https://as.ex\",\"authorization_endpoint\":\"https://as.ex/a\","
        + "\"token_endpoint\":\"https://as.ex/t\",\"registration_endpoint\":\"https://as.ex/r\","
        + "\"revocation_endpoint\":\"https://as.ex/v\",\"code_challenge_methods_supported\":[\"S256\"],"
        + "\"client_id_metadata_document_supported\":true,\"authorization_response_iss_parameter_supported\":true}";

    @Test
    @DisplayName("chaine complete : WWW-Authenticate (et ses portées) -> PRM -> Authorization Server Metadata")
    void fullChain() throws Exception {
        when(client.probeWwwAuthenticate("https://mcp.ex/mcp"))
            .thenReturn("Bearer resource_metadata=\"https://mcp.ex/.well-known/oauth-protected-resource/mcp\", scope=\"read\"");
        when(client.getJsonOrNull("https://mcp.ex/.well-known/oauth-protected-resource/mcp"))
            .thenReturn(om.readTree("{\"resource\":\"https://mcp.ex/mcp\",\"authorization_servers\":[\"https://as.ex\"]}"));
        when(client.getJsonOrNull("https://as.ex/.well-known/oauth-authorization-server")).thenReturn(om.readTree(AS));

        DiscoveredAuth a = discovery.discover("https://mcp.ex/mcp");
        assertThat(a.authorizationEndpoint()).isEqualTo("https://as.ex/a");
        assertThat(a.tokenEndpoint()).isEqualTo("https://as.ex/t");
        assertThat(a.registrationEndpoint()).isEqualTo("https://as.ex/r");
        assertThat(a.revocationEndpoint()).isEqualTo("https://as.ex/v");
        assertThat(a.resource()).isEqualTo("https://mcp.ex/mcp");
        assertThat(a.challengeScope()).isEqualTo("read");
        assertThat(a.cimdSupported()).isTrue();
        assertThat(a.issParameterSupported()).isTrue();
    }

    @Test
    @DisplayName("un émetteur avec un chemin : la metadata se cherche avec le chemin inséré (RFC 8414), comme GitHub")
    void issuerWithAPath() throws Exception {
        when(client.probeWwwAuthenticate("https://mcp.ex/mcp")).thenReturn(null);
        when(client.getJsonOrNull("https://mcp.ex/.well-known/oauth-protected-resource/mcp"))
            .thenReturn(om.readTree("{\"authorization_servers\":[\"https://as.ex/login/oauth\"]}"));
        when(client.getJsonOrNull("https://as.ex/.well-known/oauth-authorization-server/login/oauth"))
            .thenReturn(om.readTree(AS.replace("\"issuer\":\"https://as.ex\"", "\"issuer\":\"https://as.ex/login/oauth\"")));

        assertThat(discovery.discover("https://mcp.ex/mcp").issuer()).isEqualTo("https://as.ex/login/oauth");
        assertThat(McpOAuthDiscovery.asMetadataUrls("https://as.ex/login/oauth")).containsExactly(
            "https://as.ex/.well-known/oauth-authorization-server/login/oauth",
            "https://as.ex/.well-known/openid-configuration/login/oauth",
            "https://as.ex/login/oauth/.well-known/openid-configuration");
    }

    @Test
    @DisplayName("fallback : le serveur MCP est son propre AS (pas de PRM)")
    void fallbackToOrigin() throws Exception {
        when(client.probeWwwAuthenticate(anyString())).thenReturn(null);
        lenient().when(client.getJsonOrNull(anyString())).thenReturn(null);
        when(client.getJsonOrNull("https://mcp.ex/.well-known/oauth-authorization-server"))
            .thenReturn(om.readTree(AS.replace("https://as.ex", "https://mcp.ex")));

        assertThat(discovery.discover("https://mcp.ex/mcp").tokenEndpoint()).isEqualTo("https://mcp.ex/t");
    }

    @Test
    @DisplayName("une metadata qui se dit d'un autre émetteur -> refusée")
    void anotherIssuerIsRefused() throws Exception {
        when(client.probeWwwAuthenticate(anyString())).thenReturn(null);
        lenient().when(client.getJsonOrNull(anyString())).thenReturn(null);
        when(client.getJsonOrNull("https://mcp.ex/.well-known/oauth-authorization-server")).thenReturn(om.readTree(AS));

        assertThatThrownBy(() -> discovery.discover("https://mcp.ex/mcp")).isInstanceOf(BusinessException.class)
            .hasMessageContaining("does not identify itself");
    }

    @Test
    @DisplayName("un serveur d'autorisation qui n'annonce pas PKCE S256 -> TaskForce refuse (norme MCP)")
    void noPkceIsRefused() throws Exception {
        when(client.probeWwwAuthenticate(anyString())).thenReturn(null);
        lenient().when(client.getJsonOrNull(anyString())).thenReturn(null);
        when(client.getJsonOrNull("https://mcp.ex/.well-known/oauth-authorization-server"))
            .thenReturn(om.readTree(AS.replace("https://as.ex", "https://mcp.ex").replace("[\"S256\"]", "[\"plain\"]")));

        assertThatThrownBy(() -> discovery.discover("https://mcp.ex/mcp")).hasMessageContaining("PKCE");
    }

    @Test
    @DisplayName("une PRM qui décrit un autre serveur -> refusée ; une origine qui contient le serveur (Slack) -> admise")
    void theResourceMustDesignateTheServer() throws Exception {
        assertThatThrownBy(() -> McpOAuthDiscovery.resource(om.readTree("{\"resource\":\"https://evil.ex/mcp\"}"),
            "https://mcp.ex/mcp")).isInstanceOf(BusinessException.class);
        assertThat(McpOAuthDiscovery.resource(om.readTree("{\"resource\":\"https://mcp.slack.com\"}"),
            "https://mcp.slack.com/mcp")).isEqualTo("https://mcp.slack.com");
        assertThat(McpOAuthDiscovery.resource(om.readTree("{\"resource\":\"https://api.example/mcp/\"}"),
            "https://api.example/mcp/readonly")).isEqualTo("https://api.example/mcp/");
        assertThat(McpOAuthDiscovery.resource(null, "https://mcp.ex/mcp")).isEqualTo("https://mcp.ex/mcp");
    }

    @Test
    @DisplayName("aucune metadata OAuth -> le serveur attend une clé, ou il est public")
    void noMetadata() {
        when(client.probeWwwAuthenticate(anyString())).thenReturn(null);
        when(client.getJsonOrNull(anyString())).thenReturn(null);
        assertThatThrownBy(() -> discovery.discover("https://mcp.ex/mcp")).isInstanceOf(McpOAuthDiscovery.NoOAuth.class);
    }
}
