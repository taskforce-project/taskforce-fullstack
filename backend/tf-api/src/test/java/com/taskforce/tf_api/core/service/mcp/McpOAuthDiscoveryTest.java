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
import static org.mockito.Mockito.when;

/**
 * Tests unitaires - {@link McpOAuthDiscovery} (TF-MCP-02) : resolution des endpoints OAuth depuis
 * la metadata d'un serveur MCP (mocke via {@link McpOAuthClient}).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("McpOAuthDiscovery")
class McpOAuthDiscoveryTest {

    @Mock private McpOAuthClient client;
    @InjectMocks private McpOAuthDiscovery discovery;

    private final ObjectMapper om = new ObjectMapper();

    @Test
    @DisplayName("chaine complete : WWW-Authenticate -> PRM -> Authorization Server Metadata")
    void fullChain() throws Exception {
        when(client.probeWwwAuthenticate("https://mcp.ex/mcp"))
            .thenReturn("Bearer resource_metadata=\"https://mcp.ex/.well-known/oauth-protected-resource\"");
        when(client.getJsonOrNull("https://mcp.ex/.well-known/oauth-protected-resource"))
            .thenReturn(om.readTree("{\"authorization_servers\":[\"https://as.ex\"]}"));
        when(client.getJsonOrNull("https://as.ex/.well-known/oauth-authorization-server"))
            .thenReturn(om.readTree("{\"issuer\":\"https://as.ex\",\"authorization_endpoint\":\"https://as.ex/a\","
                + "\"token_endpoint\":\"https://as.ex/t\",\"registration_endpoint\":\"https://as.ex/r\"}"));

        DiscoveredAuth a = discovery.discover("https://mcp.ex/mcp");
        assertThat(a.authorizationEndpoint()).isEqualTo("https://as.ex/a");
        assertThat(a.tokenEndpoint()).isEqualTo("https://as.ex/t");
        assertThat(a.registrationEndpoint()).isEqualTo("https://as.ex/r");
    }

    @Test
    @DisplayName("fallback : le serveur MCP est son propre AS (pas de PRM)")
    void fallbackToOrigin() throws Exception {
        when(client.probeWwwAuthenticate(anyString())).thenReturn(null);
        when(client.getJsonOrNull("https://mcp.ex/.well-known/oauth-protected-resource")).thenReturn(null);
        when(client.getJsonOrNull("https://mcp.ex/.well-known/oauth-authorization-server"))
            .thenReturn(om.readTree("{\"authorization_endpoint\":\"https://mcp.ex/a\",\"token_endpoint\":\"https://mcp.ex/t\","
                + "\"registration_endpoint\":\"https://mcp.ex/r\"}"));

        assertThat(discovery.discover("https://mcp.ex/mcp").tokenEndpoint()).isEqualTo("https://mcp.ex/t");
    }

    @Test
    @DisplayName("aucune metadata OAuth -> echec clair")
    void noMetadata() {
        when(client.probeWwwAuthenticate(anyString())).thenReturn(null);
        when(client.getJsonOrNull(anyString())).thenReturn(null);
        assertThatThrownBy(() -> discovery.discover("https://mcp.ex/mcp")).isInstanceOf(BusinessException.class);
    }
}
