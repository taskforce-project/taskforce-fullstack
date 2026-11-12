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
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires - {@link McpClientRegistrar} : un client enregistré d'avance (l'application de l'entreprise, ou la
 * nôtre) et son secret ne se présentent qu'à l'émetteur épinglé (celui du serveur officiel du préréglage, ou celui
 * épinglé sur l'application de l'entreprise) ; tout autre émetteur passe par l'inscription dynamique, sans ces secrets.
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

        assertThat(registrar.clientFor(1L, "linear", auth, REDIRECT, true, false))
            .isEqualTo(new RegisteredClient("company-client", "company-secret", McpClientRegistrar.COMPANY));
        assertThat(registrar.clientFor(1L, "linear", auth, REDIRECT, false, false))
            .isEqualTo(new RegisteredClient("dcr-client", null, McpClientRegistrar.DCR));
    }

    @Test
    @DisplayName("un outil sans serveur officiel : l'application de l'entreprise va à l'émetteur épinglé sur elle, que la "
        + "connexion d'un propriétaire ou d'un administrateur épingle")
    void theCompanyAppOfAToolWithoutOfficialServerGoesToItsPinnedIssuer() {
        ConnectorApp app = ConnectorApp.builder().connectorKey("glean").clientId("company-client")
            .clientSecret("company-secret").build();
        when(apps.findByWorkspaceIdAndConnectorKey(1L, "glean")).thenReturn(Optional.of(app));
        RegisteredClient company = new RegisteredClient("company-client", "company-secret", McpClientRegistrar.COMPANY);

        // Rien d'épinglé : un propriétaire ou un administrateur se connecte par elle ; un membre, par l'inscription dynamique.
        assertThat(registrar.clientFor(1L, "glean", auth, REDIRECT, false, true)).isEqualTo(company);
        assertThat(registrar.clientFor(1L, "glean", auth, REDIRECT, false, false).source()).isEqualTo(McpClientRegistrar.DCR);

        // La connexion qui aboutit épingle son émetteur ; un second épinglage ne le change pas.
        registrar.pinCompanyIssuer(1L, "glean", "https://as.ex/");
        registrar.pinCompanyIssuer(1L, "glean", "https://other.ex");
        assertThat(app.getIssuer()).isEqualTo("https://as.ex/");
        verify(apps, times(1)).save(app);

        // Épinglé : le même émetteur, aux barres finales près, pour chaque personne de l'espace ; un autre, jamais.
        assertThat(registrar.clientFor(1L, "glean", auth, REDIRECT, false, false)).isEqualTo(company);
        DiscoveredAuth other = new DiscoveredAuth("https://other.ex", "https://other.ex/authorize",
            "https://other.ex/token", "https://other.ex/register", null);
        when(registrations.findByIssuerAndRedirectUri("https://other.ex", REDIRECT)).thenReturn(Optional.of(
            McpOAuthRegistration.builder().issuer("https://other.ex").redirectUri(REDIRECT).clientId("dcr-other").build()));
        assertThat(registrar.clientFor(1L, "glean", other, REDIRECT, false, true))
            .isEqualTo(new RegisteredClient("dcr-other", null, McpClientRegistrar.DCR));
    }

    @Test
    @DisplayName("notre client et son secret : chez l'émetteur épinglé seulement")
    void ourClientOnlyGoesToThePinnedIssuer() {
        when(apps.findByWorkspaceIdAndConnectorKey(1L, "asana")).thenReturn(Optional.empty());
        env.setProperty("TF_MCP_ASANA_CLIENT_ID", "our-client");
        env.setProperty("TF_MCP_ASANA_CLIENT_SECRET", "our-secret");

        assertThat(registrar.clientFor(1L, "asana", auth, REDIRECT, true, false))
            .isEqualTo(new RegisteredClient("our-client", "our-secret", McpClientRegistrar.OURS));
        assertThat(registrar.clientFor(1L, "asana", auth, REDIRECT, false, true).source()).isEqualTo(McpClientRegistrar.DCR);
    }
}
