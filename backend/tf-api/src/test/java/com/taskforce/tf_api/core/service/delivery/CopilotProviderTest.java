package com.taskforce.tf_api.core.service.delivery;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Contract test (wire) — {@link CopilotProvider} contre l'inférence de modèles hébergée par GitHub
 * (OpenAI-compatible, TF-AGENT-DELIVERY). Provider <b>synchrone</b> réutilisant le token GitHub du
 * workspace : {@link MockRestServiceServer} valide la requête (POST /inference/chat/completions, Bearer
 * token GitHub, messages system+user) et le parsing OpenAI ({@code choices[0].message.content}), + les
 * gardes (GitHub non connecté, erreur API).
 *
 * <p>Preuve automatisée du câblage (non vérifié en live faute de compte Copilot).</p>
 */
@DisplayName("CopilotProvider (contract wire GitHub Models inference)")
class CopilotProviderTest {

    private static final long WS = 42L;

    private IntegrationRepository integrations;
    private CopilotProvider provider;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        integrations = mock(IntegrationRepository.class);
        provider = new CopilotProvider(integrations);
        RestTemplate rt = (RestTemplate) ReflectionTestUtils.getField(provider, "http");
        server = MockRestServiceServer.createServer(rt);
    }

    private void githubConnected(String token) {
        Integration integ = new Integration();
        integ.setAccessToken(token);
        when(integrations.findByWorkspaceIdAndProvider(WS, IntegrationProvider.GITHUB))
            .thenReturn(Optional.of(integ));
    }

    @Test
    @DisplayName("métadonnées : github-copilot, disponible, logo githubcopilot")
    void metadata() {
        assertThat(provider.key()).isEqualTo("github-copilot");
        assertThat(provider.available()).isTrue();
        assertThat(provider.logoKey()).isEqualTo("githubcopilot");
    }

    @Test
    @DisplayName("dispatch : POST inference (token GitHub + messages) → résultat DONE synchrone")
    void dispatch_calls_inference_and_parses() {
        githubConnected("gho_token");
        server.expect(requestTo(CopilotProvider.INFERENCE_URL))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("Authorization", "Bearer gho_token"))
            .andExpect(jsonPath("$.messages[0].role").value("system"))
            .andExpect(jsonPath("$.messages[1].role").value("user"))
            .andExpect(jsonPath("$.messages[1].content").value(containsString("Ecrire les tests")))
            .andRespond(withSuccess(
                "{\"id\":\"cmpl_1\",\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\","
                + "\"content\":\"Voici les tests unitaires...\"},\"finish_reason\":\"stop\"}]}",
                MediaType.APPLICATION_JSON));

        DeliveryDispatch d = provider.dispatch(
            new AgentBrief(7L, WS, "Ecrire les tests", "Couvrir le service X", "acme/app", "openai/gpt-4o"));

        assertThat(d.externalRef()).isEqualTo("cmpl_1");
        assertThat(d.immediateResult()).isNotNull();
        assertThat(d.immediateResult().status()).isEqualTo(DeliveryRunStatus.DONE);
        assertThat(d.immediateResult().summary()).contains("tests unitaires");
        server.verify();
    }

    @Test
    @DisplayName("GitHub non connecté : BusinessException claire, aucun appel réseau")
    void dispatch_without_github_fails() {
        when(integrations.findByWorkspaceIdAndProvider(WS, IntegrationProvider.GITHUB)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> provider.dispatch(new AgentBrief(1L, WS, "T", null, null, null)))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("GitHub");
        server.verify();
    }

    @Test
    @DisplayName("API 401 (token sans accès modèles) → BusinessException remontant l'erreur")
    void dispatch_maps_api_error() {
        githubConnected("bad");
        server.expect(requestTo(CopilotProvider.INFERENCE_URL))
            .andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("{\"error\":{\"message\":\"Bad credentials\"}}")
                .contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.dispatch(new AgentBrief(1L, WS, "T", null, null, null)))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("GitHub Copilot");
        server.verify();
    }
}
