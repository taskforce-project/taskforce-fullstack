package com.taskforce.tf_api.core.service.mcp;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.env.MockEnvironment;

import com.taskforce.tf_api.core.model.ConnectorApp;
import com.taskforce.tf_api.core.model.McpOAuthRegistration;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.repository.McpOAuthRegistrationRepository;
import com.taskforce.tf_api.core.service.mcp.McpClientRegistrar.RegisteredClient;
import com.taskforce.tf_api.core.service.mcp.McpOAuthDiscovery.DiscoveredAuth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires - {@link McpClientRegistrar} : un client enregistré d'avance (l'application de l'entreprise, ou la
 * nôtre) et son secret ne se présentent qu'à l'émetteur que le préréglage épingle ; tout autre émetteur passe par
 * l'inscription dynamique, sans ces secrets.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("McpClientRegistrar")
class McpClientRegistrarTest {

    private static final String REDIRECT = "http://localhost:8080/api/mcp/oauth/callback";

    @Mock private ConnectorAppRepository apps;
    @Mock private McpOAuthRegistrationRepository registrations;
    @Mock private McpOAuthClient client;

    private final MockEnvironment env = new MockEnvironment();
    private final DiscoveredAuth auth = new DiscoveredAuth("https://as.ex", "https://as.ex/authorize",
        "https://as.ex/token", "https://as.ex/register", null);
    private McpClientRegistrar registrar;

    @BeforeEach
    void setUp() {
        McpOAuthSettings settings = new McpOAuthSettings("http://localhost:8080", "", "http://localhost:3000",
            "TaskForce", "web", "");
        registrar = new McpClientRegistrar(apps, registrations, client, settings, env);
        lenient().when(registrations.findByIssuerAndRedirectUri("https://as.ex", REDIRECT))
            .thenReturn(Optional.of(McpOAuthRegistration.builder().issuer("https://as.ex").redirectUri(REDIRECT)
                .clientId("dcr-client").build()));
    }

    @Test
    @DisplayName("l'application de l'entreprise et son secret : chez l'émetteur épinglé seulement")
    void theCompanyAppOnlyGoesToThePinnedIssuer() {
        lenient().when(apps.findByWorkspaceIdAndConnectorKey(1L, "linear")).thenReturn(Optional.of(
            ConnectorApp.builder().connectorKey("linear").clientId("company-client").clientSecret("company-secret").build()));

        assertThat(registrar.clientFor(1L, "linear", auth, REDIRECT, true))
            .isEqualTo(new RegisteredClient("company-client", "company-secret", McpClientRegistrar.COMPANY));
        assertThat(registrar.clientFor(1L, "linear", auth, REDIRECT, false))
            .isEqualTo(new RegisteredClient("dcr-client", null, McpClientRegistrar.DCR));
    }

    @Test
    @DisplayName("notre client et son secret : chez l'émetteur épinglé seulement")
    void ourClientOnlyGoesToThePinnedIssuer() {
        when(apps.findByWorkspaceIdAndConnectorKey(1L, "asana")).thenReturn(Optional.empty());
        env.setProperty("TF_MCP_ASANA_CLIENT_ID", "our-client");
        env.setProperty("TF_MCP_ASANA_CLIENT_SECRET", "our-secret");

        assertThat(registrar.clientFor(1L, "asana", auth, REDIRECT, true))
            .isEqualTo(new RegisteredClient("our-client", "our-secret", McpClientRegistrar.OURS));
        assertThat(registrar.clientFor(1L, "asana", auth, REDIRECT, false).source()).isEqualTo(McpClientRegistrar.DCR);
    }
}
