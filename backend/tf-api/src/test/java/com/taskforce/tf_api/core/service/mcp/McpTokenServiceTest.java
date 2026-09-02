package com.taskforce.tf_api.core.service.mcp;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires - {@link McpTokenService} (TF-MCP-02) : detection OAuth, refresh automatique
 * (avant expiration) et stockage des tokens dans le config JSON de la connexion.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("McpTokenService")
class McpTokenServiceTest {

    @Mock private McpOAuthClient client;
    @Mock private ConnectorConnectionRepository repository;

    private final ObjectMapper om = new ObjectMapper();
    private McpTokenService service;

    @BeforeEach
    void setup() {
        service = new McpTokenService(client, repository, om);
    }

    private ConnectorConnection conn(String config) {
        return ConnectorConnection.builder().connectorKey("linear").config(config).build();
    }

    @Test
    @DisplayName("isOAuth : vrai seulement avec issuer + access token")
    void isOAuth() {
        assertThat(service.isOAuth(Map.of("mcpOAuthIssuer", "i", "mcpAccessToken", "a"))).isTrue();
        assertThat(service.isOAuth(Map.of("mcpUrl", "u"))).isFalse();
        assertThat(service.isOAuth(null)).isFalse();
    }

    @Test
    @DisplayName("validAccessToken : connexion non-OAuth -> null, aucun appel")
    void notOAuth() {
        assertThat(service.validAccessToken(conn("{\"mcpUrl\":\"https://x/mcp\"}"))).isNull();
        verifyNoInteractions(client);
    }

    @Test
    @DisplayName("validAccessToken : token encore valide -> renvoye tel quel, aucun refresh")
    void stillValid() {
        long future = System.currentTimeMillis() + 3_600_000L;
        String cfg = "{\"mcpOAuthIssuer\":\"i\",\"mcpAccessToken\":\"AT\",\"mcpExpiresAt\":\"" + future + "\"}";
        assertThat(service.validAccessToken(conn(cfg))).isEqualTo("AT");
        verifyNoInteractions(client);
        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("validAccessToken : expire -> refresh (postForm) + persiste le nouveau token")
    void refreshesWhenExpired() throws Exception {
        String cfg = "{\"mcpOAuthIssuer\":\"i\",\"mcpAccessToken\":\"OLD\",\"mcpRefreshToken\":\"RT\","
            + "\"mcpExpiresAt\":\"1000\",\"mcpTokenEndpoint\":\"https://as.ex/token\",\"mcpClientId\":\"cid\"}";
        ConnectorConnection c = conn(cfg);
        when(client.postForm(eq("https://as.ex/token"), any()))
            .thenReturn(om.readTree("{\"access_token\":\"NEW\",\"expires_in\":3600}"));

        assertThat(service.validAccessToken(c)).isEqualTo("NEW");
        verify(repository).save(c);
        assertThat(c.getConfig()).contains("NEW");
    }

    @Test
    @DisplayName("validAccessToken : expire sans refresh token -> token courant (best-effort)")
    void expiredNoRefresh() {
        String cfg = "{\"mcpOAuthIssuer\":\"i\",\"mcpAccessToken\":\"AT\",\"mcpExpiresAt\":\"1000\"}";
        assertThat(service.validAccessToken(conn(cfg))).isEqualTo("AT");
        verifyNoInteractions(client);
    }

    @Test
    @DisplayName("storeInitialTokens : ecrit mcpUrl + issuer + tokens dans le config")
    void storeInitial() throws Exception {
        ConnectorConnection c = conn("{}");
        service.storeInitialTokens(c,
            om.readTree("{\"access_token\":\"AT\",\"refresh_token\":\"RT\",\"expires_in\":3600}"),
            "https://mcp.ex/mcp", "https://as.ex", "cid", "csecret", "https://as.ex/token");

        verify(repository).save(c);
        assertThat(c.getConfig())
            .contains("\"mcpUrl\":\"https://mcp.ex/mcp\"")
            .contains("\"mcpOAuthIssuer\":\"https://as.ex\"")
            .contains("\"mcpAccessToken\":\"AT\"")
            .contains("\"mcpRefreshToken\":\"RT\"")
            .contains("\"mcpClientId\":\"cid\"")
            .contains("\"mcpTokenEndpoint\":\"https://as.ex/token\"");
    }
}
