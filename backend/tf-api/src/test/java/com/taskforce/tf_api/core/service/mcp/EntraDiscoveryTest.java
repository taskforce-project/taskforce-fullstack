package com.taskforce.tf_api.core.service.mcp;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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
 * Microsoft Entra accepte PKCE S256 sans l'annoncer dans sa metadata, et nomme son émetteur {@code {tenantid}} pour
 * {@code common} (TF-J2-14). TaskForce l'admet pour les seuls émetteurs d'Entra, sur leur hôte, quand la metadata se tait ;
 * pour tout autre serveur, la vérification reste entière.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Entra : PKCE S256 non annoncé, l'émetteur {tenantid}")
class EntraDiscoveryTest {

    @Mock private McpOAuthClient client;
    @InjectMocks private McpOAuthDiscovery discovery;

    private final ObjectMapper om = new ObjectMapper();

    private static final String COMMON = "https://login.microsoftonline.com/common/v2.0";

    /** La metadata d'Entra pour common, telle que Microsoft la publie (sans code_challenge_methods_supported). */
    private static String entraMetadata(String host) {
        return "{\"token_endpoint\":\"https://" + host + "/common/oauth2/v2.0/token\","
            + "\"issuer\":\"https://login.microsoftonline.com/{tenantid}/v2.0\","
            + "\"authorization_endpoint\":\"https://" + host + "/common/oauth2/v2.0/authorize\","
            + "\"scopes_supported\":[\"openid\",\"profile\",\"email\",\"offline_access\"],"
            + "\"response_types_supported\":[\"code\",\"id_token\"],\"msgraph_host\":\"graph.microsoft.com\"}";
    }

    @Test
    @DisplayName("common : l'émetteur modèle et PKCE S256 admis, pour Entra seulement")
    void entraCommon() throws Exception {
        lenient().when(client.getJsonOrNull(anyString())).thenReturn(null);
        when(client.getJsonOrNull(COMMON + "/.well-known/openid-configuration"))
            .thenReturn(om.readTree(entraMetadata("login.microsoftonline.com")));

        DiscoveredAuth auth = discovery.discoverIssuer(COMMON);

        assertThat(auth.issuer()).isEqualTo("https://login.microsoftonline.com/{tenantid}/v2.0");
        assertThat(auth.authorizationEndpoint()).isEqualTo("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
        assertThat(auth.tokenEndpoint()).isEqualTo("https://login.microsoftonline.com/common/oauth2/v2.0/token");
        assertThat(auth.resource()).isNull();
    }

    @Test
    @DisplayName("un autre serveur muet sur PKCE reste refusé, même s'il copie la metadata d'Entra")
    void othersStayStrict() throws Exception {
        lenient().when(client.getJsonOrNull(anyString())).thenReturn(null);
        when(client.getJsonOrNull("https://as.ex/.well-known/oauth-authorization-server"))
            .thenReturn(om.readTree("{\"issuer\":\"https://as.ex\",\"authorization_endpoint\":\"https://as.ex/a\","
                + "\"token_endpoint\":\"https://as.ex/t\"}"));
        assertThatThrownBy(() -> discovery.discoverIssuer("https://as.ex"))
            .isInstanceOf(BusinessException.class).hasMessageContaining("PKCE");

        String lookalike = "https://login.microsoftonline.com.evil.ex/common/v2.0";
        when(client.getJsonOrNull(lookalike + "/.well-known/openid-configuration"))
            .thenReturn(om.readTree(entraMetadata("login.microsoftonline.com.evil.ex")));
        assertThatThrownBy(() -> discovery.discoverIssuer(lookalike)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("Entra lui-même : une metadata qui annonce d'autres méthodes sans S256, ou des endpoints ailleurs, est refusée")
    void entraStillChecked() throws Exception {
        lenient().when(client.getJsonOrNull(anyString())).thenReturn(null);
        String plain = entraMetadata("login.microsoftonline.com").replace("\"msgraph_host\"",
            "\"code_challenge_methods_supported\":[\"plain\"],\"msgraph_host\"");
        when(client.getJsonOrNull(COMMON + "/.well-known/openid-configuration")).thenReturn(om.readTree(plain));
        assertThatThrownBy(() -> discovery.discoverIssuer(COMMON)).hasMessageContaining("PKCE");

        String elsewhere = entraMetadata("login.microsoftonline.com").replace(
            "\"authorization_endpoint\":\"https://login.microsoftonline.com", "\"authorization_endpoint\":\"https://evil.ex");
        when(client.getJsonOrNull(COMMON + "/.well-known/openid-configuration")).thenReturn(om.readTree(elsewhere));
        assertThatThrownBy(() -> discovery.discoverIssuer(COMMON)).hasMessageContaining("PKCE");
    }

    @ParameterizedTest(name = "{1} déclaré pour {0} : {2}")
    @CsvSource({
        "https://login.microsoftonline.com/common/v2.0, https://login.microsoftonline.com/{tenantid}/v2.0, true",
        "https://login.microsoftonline.com/organizations/v2.0, https://login.microsoftonline.com/{tenantid}/v2.0, true",
        "https://login.microsoftonline.com/consumers/v2.0, https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0, true",
        "https://login.microsoftonline.com/contoso.onmicrosoft.com/v2.0, https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0, true",
        "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0, https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0, true",
        "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0, https://login.microsoftonline.com/{tenantid}/v2.0, false",
        "https://login.microsoftonline.com/common/v2.0, https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0, false",
        "https://login.microsoftonline.com/common/v2.0, https://evil.ex/{tenantid}/v2.0, false",
        "https://login.microsoftonline.com:8443/common/v2.0, https://login.microsoftonline.com/{tenantid}/v2.0, false",
    })
    @DisplayName("l'émetteur qu'Entra déclare pour celui qu'on demande")
    void entraIssuers(String asked, String declared, boolean matches) {
        assertThat(McpOAuthDiscovery.entraIssuerMatches(declared, asked)).isEqualTo(matches);
    }
}
