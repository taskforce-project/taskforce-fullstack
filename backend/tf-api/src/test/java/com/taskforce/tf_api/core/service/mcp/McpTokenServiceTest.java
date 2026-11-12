package com.taskforce.tf_api.core.service.mcp;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.ConnectionState;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires - {@link McpTokenService} (TF-MCP-02, séance n°22 R158) : stockage, renouvellement avec rotation,
 * passage à « Needs reconnecting » quand l'éditeur refuse, révocation à la déconnexion (RFC 7009).
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
        return ConnectorConnection.builder().id(5L).connectorKey("linear").config(config).build();
    }

    private static final String EXPIRED = "{\"mcpOAuthIssuer\":\"i\",\"mcpAccessToken\":\"OLD\",\"mcpRefreshToken\":\"RT\","
        + "\"mcpExpiresAt\":\"1000\",\"mcpTokenEndpoint\":\"https://as.ex/token\",\"mcpClientId\":\"cid\","
        + "\"mcpResource\":\"https://mcp.ex/mcp\"}";

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
    @DisplayName("validAccessToken : token encore valide (ou sans expiration connue) -> renvoye tel quel, aucun refresh")
    void stillValid() {
        long future = System.currentTimeMillis() + 3_600_000L;
        String cfg = "{\"mcpOAuthIssuer\":\"i\",\"mcpAccessToken\":\"AT\",\"mcpExpiresAt\":\"" + future + "\"}";
        assertThat(service.validAccessToken(conn(cfg))).isEqualTo("AT");
        assertThat(service.validAccessToken(conn("{\"mcpOAuthIssuer\":\"i\",\"mcpAccessToken\":\"AT\"}"))).isEqualTo("AT");
        verifyNoInteractions(client);
        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("validAccessToken : expire -> refresh avec la ressource, le nouveau jeton de renouvellement remplace l'ancien")
    void refreshRotates() throws Exception {
        ConnectorConnection c = conn(EXPIRED);
        when(client.postForm(eq("https://as.ex/token"), any()))
            .thenReturn(om.readTree("{\"access_token\":\"NEW\",\"refresh_token\":\"RT2\",\"expires_in\":3600}"));

        assertThat(service.validAccessToken(c)).isEqualTo("NEW");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> form = ArgumentCaptor.forClass(Map.class);
        verify(client).postForm(eq("https://as.ex/token"), form.capture());
        assertThat(form.getValue()).containsEntry("grant_type", "refresh_token").containsEntry("refresh_token", "RT")
            .containsEntry("resource", "https://mcp.ex/mcp");
        verify(repository).save(c);
        assertThat(c.getConfig()).contains("\"mcpRefreshToken\":\"RT2\"").doesNotContain("\"RT\"");
        assertThat(c.getState()).isEqualTo(ConnectionState.CONNECTED);
    }

    @Test
    @DisplayName("deux renouvellements de la même connexion : le second reprend le jeton du premier, sans re-présenter l'ancien")
    void secondRefreshReusesTheFirst() throws Exception {
        when(client.postForm(eq("https://as.ex/token"), any()))
            .thenReturn(om.readTree("{\"access_token\":\"NEW\",\"refresh_token\":\"RT2\",\"expires_in\":3600}"));

        assertThat(service.validAccessToken(conn(EXPIRED))).isEqualTo("NEW");
        // Une autre lecture de la même ligne, faite avant le premier renouvellement, a encore l'ancien jeton.
        assertThat(service.validAccessToken(conn(EXPIRED))).isEqualTo("NEW");

        verify(client, times(1)).postForm(any(), anyMap());
    }

    @Test
    @DisplayName("refus du renouvellement (invalid_grant) -> connexion à refaire, aucun jeton rendu")
    void invalidGrantNeedsReconnect() {
        ConnectorConnection c = conn(EXPIRED);
        when(client.postForm(eq("https://as.ex/token"), any()))
            .thenThrow(new McpOAuthClient.OAuthError("refused", "invalid_grant", 400));

        assertThat(service.validAccessToken(c)).isNull();
        assertThat(c.getState()).isEqualTo(ConnectionState.NEEDS_RECONNECT);
        verify(repository).save(c);
    }

    @Test
    @DisplayName("panne passagère du renouvellement -> le jeton courant, la connexion reste branchée")
    void transientFailureKeepsTheToken() {
        ConnectorConnection c = conn(EXPIRED);
        when(client.postForm(eq("https://as.ex/token"), any()))
            .thenThrow(new McpOAuthClient.OAuthError("down", "temporarily_unavailable", 503));

        assertThat(service.validAccessToken(c)).isEqualTo("OLD");
        assertThat(c.getState()).isEqualTo(ConnectionState.CONNECTED);
    }

    @Test
    @DisplayName("validAccessToken : expire sans refresh token -> token courant (best-effort) ; refreshNow -> à refaire")
    void expiredNoRefresh() {
        String cfg = "{\"mcpOAuthIssuer\":\"i\",\"mcpAccessToken\":\"AT\",\"mcpExpiresAt\":\"1000\"}";
        assertThat(service.validAccessToken(conn(cfg))).isEqualTo("AT");
        ConnectorConnection c = conn(cfg);
        assertThat(service.refreshNow(c)).isNull();
        assertThat(c.getState()).isEqualTo(ConnectionState.NEEDS_RECONNECT);
        verifyNoInteractions(client);
    }

    @Test
    @DisplayName("storeInitialTokens : ecrit mcpUrl + nom + issuer + tokens + revocation, et retire un jeton colle precedent")
    void storeInitial() throws Exception {
        ConnectorConnection c = conn("{\"mcpToken\":\"old\",\"mcpHeader\":\"X-Api-Key\"}");
        service.storeInitialTokens(c,
            om.readTree("{\"access_token\":\"AT\",\"refresh_token\":\"RT\",\"expires_in\":3600}"),
            new McpTokenService.OAuthGrant("https://mcp.ex/mcp", "Team docs", "https://as.ex", "cid", "csecret",
                "https://as.ex/token", "https://as.ex/revoke", "dcr", "https://mcp.ex/mcp"));

        verify(repository).save(c);
        assertThat(c.getConfig())
            .contains("\"mcpUrl\":\"https://mcp.ex/mcp\"")
            .contains("\"mcpOAuthIssuer\":\"https://as.ex\"")
            .contains("\"mcpAccessToken\":\"AT\"")
            .contains("\"mcpRefreshToken\":\"RT\"")
            .contains("\"mcpClientId\":\"cid\"")
            .contains("\"mcpTokenEndpoint\":\"https://as.ex/token\"")
            .contains("\"mcpRevocationEndpoint\":\"https://as.ex/revoke\"")
            .contains("\"mcpClientSource\":\"dcr\"")
            .contains("\"mcpName\":\"Team docs\"")
            .doesNotContain("mcpToken\"").doesNotContain("mcpHeader");
    }

    @Test
    @DisplayName("revoke : le jeton de renouvellement puis le jeton d'accès, à l'endpoint de l'éditeur (RFC 7009)")
    void revokesBothTokens() {
        ConnectorConnection c = conn("{\"mcpOAuthIssuer\":\"i\",\"mcpAccessToken\":\"AT\",\"mcpRefreshToken\":\"RT\","
            + "\"mcpClientId\":\"cid\",\"mcpRevocationEndpoint\":\"https://as.ex/revoke\"}");
        when(client.postFormStatus(eq("https://as.ex/revoke"), anyMap())).thenReturn(200);

        assertThat(service.canRevoke(Map.of("mcpOAuthIssuer", "i", "mcpAccessToken", "AT",
            "mcpRevocationEndpoint", "https://as.ex/revoke"))).isTrue();
        assertThat(service.revoke(c)).isTrue();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> form = ArgumentCaptor.forClass(Map.class);
        verify(client, times(2)).postFormStatus(eq("https://as.ex/revoke"), form.capture());
        assertThat(form.getAllValues().get(0)).containsEntry("token", "RT").containsEntry("token_type_hint", "refresh_token")
            .containsEntry("client_id", "cid");
        assertThat(form.getAllValues().get(1)).containsEntry("token", "AT").containsEntry("token_type_hint", "access_token");
    }

    @Test
    @DisplayName("revoke : sans endpoint de révocation, ou pour un jeton collé -> rien n'est envoyé, faux")
    void noRevocationWithoutEndpoint() {
        assertThat(service.revoke(conn("{\"mcpOAuthIssuer\":\"i\",\"mcpAccessToken\":\"AT\"}"))).isFalse();
        assertThat(service.revoke(conn("{\"mcpUrl\":\"https://x/mcp\",\"mcpToken\":\"k\"}"))).isFalse();
        assertThat(service.canRevoke(Map.of("mcpUrl", "u"))).isFalse();
        verifyNoInteractions(client);
    }
}
