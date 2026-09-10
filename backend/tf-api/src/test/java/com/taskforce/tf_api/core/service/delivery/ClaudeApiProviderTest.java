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
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Contract test (wire) — {@link ClaudeApiProvider} contre l'API Messages d'Anthropic (délégation
 * Claude, TF-AGENT-DELIVERY B1). {@link MockRestServiceServer} lié au {@code RestTemplate} interne :
 * valide la <b>vraie requête HTTP</b> (URL {@code /v1/messages}, en-têtes {@code x-api-key} +
 * {@code anthropic-version}, corps {@code {model, max_tokens, system, messages}}), le parsing du
 * résultat ({@code content[].text} → résumé) et la gestion d'erreur (clé absente, 401).
 *
 * <p>C'est la preuve automatisée du chemin B1 : impossible à tester en live (pas de crédits API).</p>
 */
@DisplayName("ClaudeApiProvider (contract wire Anthropic Messages API)")
class ClaudeApiProviderTest {

    private static final long WS = 42L;

    private IntegrationRepository integrations;
    private ClaudeApiProvider provider;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        integrations = mock(IntegrationRepository.class);
        provider = new ClaudeApiProvider(integrations);
        RestTemplate rt = (RestTemplate) ReflectionTestUtils.getField(provider, "http");
        server = MockRestServiceServer.createServer(rt);
    }

    private void keyConnected(String key) {
        Integration integ = new Integration();
        integ.setAccessToken(key);
        when(integrations.findByWorkspaceIdAndProvider(WS, IntegrationProvider.ANTHROPIC))
            .thenReturn(Optional.of(integ));
    }

    @Test
    @DisplayName("métadonnées : claude-api, disponible, logo claude")
    void metadata() {
        assertThat(provider.key()).isEqualTo("claude-api");
        assertThat(provider.available()).isTrue();
        assertThat(provider.logoKey()).isEqualTo("anthropic");
        assertThat(provider.models()).contains("claude-opus-5", "claude-sonnet-5");
    }

    @Test
    @DisplayName("dispatch : POST /v1/messages (en-têtes + corps) et parse content[].text → résumé DONE")
    void dispatch_calls_messages_and_parses_text() {
        keyConnected("sk-ant-test-key");
        server.expect(requestTo(ClaudeApiProvider.MESSAGES_URL))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("x-api-key", "sk-ant-test-key"))
            .andExpect(header("anthropic-version", ClaudeApiProvider.ANTHROPIC_VERSION))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.model").value("claude-sonnet-5")) // défaut (brief.model null)
            .andExpect(jsonPath("$.max_tokens").value(4096))
            .andExpect(jsonPath("$.messages[0].role").value("user"))
            .andExpect(jsonPath("$.messages[0].content").value(containsString("Configurer le CI")))
            .andRespond(withSuccess(
                "{\"id\":\"msg_123\",\"type\":\"message\",\"role\":\"assistant\","
                + "\"content\":[{\"type\":\"text\",\"text\":\"Voici le plan: 1) ... 2) ...\"}],"
                + "\"model\":\"claude-sonnet-5\",\"stop_reason\":\"end_turn\"}",
                MediaType.APPLICATION_JSON));

        AgentBrief brief = new AgentBrief(7L, WS, "Configurer le CI", "Ajouter un workflow GitHub Actions", null, null);
        DeliveryDispatch dispatch = provider.dispatch(brief);

        assertThat(dispatch.externalRef()).isEqualTo("msg_123");
        assertThat(dispatch.immediateResult()).isNotNull();
        assertThat(dispatch.immediateResult().status()).isEqualTo(DeliveryRunStatus.DONE);
        assertThat(dispatch.immediateResult().summary()).contains("Voici le plan");
        server.verify();
    }

    @Test
    @DisplayName("dispatch : le modèle choisi dans le brief est transmis à l'API")
    void dispatch_uses_brief_model() {
        keyConnected("sk-ant-x");
        server.expect(requestTo(ClaudeApiProvider.MESSAGES_URL))
            .andExpect(jsonPath("$.model").value("claude-opus-5"))
            .andRespond(withSuccess(
                "{\"id\":\"m\",\"content\":[{\"type\":\"text\",\"text\":\"ok\"}]}", MediaType.APPLICATION_JSON));

        DeliveryDispatch d = provider.dispatch(
            new AgentBrief(1L, WS, "T", null, null, "claude-opus-5"));

        assertThat(d.immediateResult().summary()).isEqualTo("ok");
        server.verify();
    }

    @Test
    @DisplayName("clé absente : BusinessException claire, aucun appel réseau")
    void dispatch_without_key_fails_clearly() {
        when(integrations.findByWorkspaceIdAndProvider(WS, IntegrationProvider.ANTHROPIC))
            .thenReturn(Optional.empty());

        assertThatThrownBy(() -> provider.dispatch(new AgentBrief(1L, WS, "T", null, null, null)))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("cle API Anthropic");
        server.verify(); // aucune requête attendue
    }

    @Test
    @DisplayName("workspace null : BusinessException, aucun appel réseau")
    void dispatch_without_workspace_fails() {
        assertThatThrownBy(() -> provider.dispatch(new AgentBrief(1L, null, "T", null, null, null)))
            .isInstanceOf(BusinessException.class);
        server.verify();
    }

    @Test
    @DisplayName("API 401 (clé invalide) : BusinessException remontant l'erreur Anthropic")
    void dispatch_maps_api_error() {
        keyConnected("sk-ant-bad");
        server.expect(requestTo(ClaudeApiProvider.MESSAGES_URL))
            .andRespond(withStatus(HttpStatus.UNAUTHORIZED)
                .body("{\"type\":\"error\",\"error\":{\"type\":\"authentication_error\",\"message\":\"invalid x-api-key\"}}")
                .contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.dispatch(new AgentBrief(1L, WS, "T", null, null, null)))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("Anthropic API");
        server.verify();
    }
}
