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
 * Contract test (wire) — {@link CursorProvider} contre l'API Background Agents de Cursor
 * (TF-AGENT-DELIVERY). Provider <b>asynchrone</b> : {@link MockRestServiceServer} valide le lancement
 * (POST /v0/agents, Bearer, body {prompt.text, source.repository}) et le suivi (GET /v0/agents/{id} →
 * RUNNING / FINISHED+PR / ERROR), + les gardes (clé absente, dépôt absent).
 *
 * <p>Preuve automatisée du câblage (contrat public, non vérifié en live faute de compte Cursor).</p>
 */
@DisplayName("CursorProvider (contract wire Cursor Background Agents)")
class CursorProviderTest {

    private static final long WS = 42L;

    private IntegrationRepository integrations;
    private CursorProvider provider;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        integrations = mock(IntegrationRepository.class);
        provider = new CursorProvider(integrations);
        RestTemplate rt = (RestTemplate) ReflectionTestUtils.getField(provider, "http");
        server = MockRestServiceServer.createServer(rt);
    }

    private void keyConnected(String key) {
        Integration integ = new Integration();
        integ.setAccessToken(key);
        when(integrations.findByWorkspaceIdAndProvider(WS, IntegrationProvider.CURSOR))
            .thenReturn(Optional.of(integ));
    }

    private AgentBrief brief() {
        return new AgentBrief(7L, WS, "Corriger le bug de login", "Le login echoue en 500", "acme/app", null);
    }

    @Test
    @DisplayName("métadonnées : cursor, disponible, logo cursor")
    void metadata() {
        assertThat(provider.key()).isEqualTo("cursor");
        assertThat(provider.available()).isTrue();
        assertThat(provider.logoKey()).isEqualTo("cursor");
    }

    @Test
    @DisplayName("dispatch : POST /v0/agents (Bearer + repo + prompt) → externalRef, pas de résultat immédiat")
    void dispatch_launches_agent() {
        keyConnected("cursor-key");
        server.expect(requestTo(CursorProvider.AGENTS_URL))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("Authorization", "Bearer cursor-key"))
            .andExpect(jsonPath("$.source.repository").value("https://github.com/acme/app"))
            .andExpect(jsonPath("$.prompt.text").value(containsString("Corriger le bug")))
            .andRespond(withSuccess("{\"id\":\"bc_123\",\"status\":\"RUNNING\"}", MediaType.APPLICATION_JSON));

        DeliveryDispatch d = provider.dispatch(brief());

        assertThat(d.externalRef()).isEqualTo("bc_123");
        assertThat(d.immediateResult()).isNull(); // asynchrone → le runner pollera
        server.verify();
    }

    @Test
    @DisplayName("clé absente : BusinessException, aucun appel réseau")
    void dispatch_without_key_fails() {
        when(integrations.findByWorkspaceIdAndProvider(WS, IntegrationProvider.CURSOR)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> provider.dispatch(brief()))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("cle API Cursor");
        server.verify();
    }

    @Test
    @DisplayName("dépôt absent : BusinessException claire, aucun appel réseau")
    void dispatch_without_repo_fails() {
        keyConnected("cursor-key");
        assertThatThrownBy(() -> provider.dispatch(new AgentBrief(7L, WS, "T", null, null, null)))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("depot");
        server.verify();
    }

    @Test
    @DisplayName("poll RUNNING → statut RUNNING (pas encore de résultat)")
    void poll_running() {
        keyConnected("cursor-key");
        server.expect(requestTo(CursorProvider.AGENTS_URL + "/bc_123"))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("Authorization", "Bearer cursor-key"))
            .andRespond(withSuccess("{\"id\":\"bc_123\",\"status\":\"RUNNING\"}", MediaType.APPLICATION_JSON));

        DeliveryPoll poll = provider.poll("bc_123", WS);

        assertThat(poll.status()).isEqualTo(DeliveryRunStatus.RUNNING);
        server.verify();
    }

    @Test
    @DisplayName("poll FINISHED → DONE + URL de la PR + résumé")
    void poll_finished() {
        keyConnected("cursor-key");
        server.expect(requestTo(CursorProvider.AGENTS_URL + "/bc_123"))
            .andRespond(withSuccess(
                "{\"id\":\"bc_123\",\"status\":\"FINISHED\",\"summary\":\"Fix applique\","
                + "\"target\":{\"prUrl\":\"https://github.com/acme/app/pull/12\"}}",
                MediaType.APPLICATION_JSON));

        DeliveryPoll poll = provider.poll("bc_123", WS);

        assertThat(poll.status()).isEqualTo(DeliveryRunStatus.DONE);
        assertThat(poll.summary()).isEqualTo("Fix applique");
        assertThat(poll.resultUrl()).isEqualTo("https://github.com/acme/app/pull/12");
        server.verify();
    }

    @Test
    @DisplayName("poll ERROR → FAILED")
    void poll_error_status() {
        keyConnected("cursor-key");
        server.expect(requestTo(CursorProvider.AGENTS_URL + "/bc_123"))
            .andRespond(withSuccess("{\"id\":\"bc_123\",\"status\":\"ERROR\"}", MediaType.APPLICATION_JSON));

        DeliveryPoll poll = provider.poll("bc_123", WS);

        assertThat(poll.status()).isEqualTo(DeliveryRunStatus.FAILED);
        server.verify();
    }

    @Test
    @DisplayName("API 401 sur poll → BusinessException remontant l'erreur Cursor")
    void poll_maps_api_error() {
        keyConnected("bad");
        server.expect(requestTo(CursorProvider.AGENTS_URL + "/bc_123"))
            .andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("{\"error\":\"unauthorized\"}")
                .contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.poll("bc_123", WS))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("Cursor API");
        server.verify();
    }
}
