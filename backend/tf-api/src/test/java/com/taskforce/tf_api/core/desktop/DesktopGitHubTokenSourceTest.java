package com.taskforce.tf_api.core.desktop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

/** Dans l'app desktop, le jeton GitHub est celui du GitHub CLI de la personne, servi par la coque. */
@DisplayName("DesktopGitHubTokenSource")
@SuppressWarnings("unchecked")
class DesktopGitHubTokenSourceTest {

    private static final String RELAY = "http://127.0.0.1:4100/token";

    private final RestTemplate rest = mock(RestTemplate.class);

    private DesktopGitHubTokenSource tokens(String url, String serviceToken) {
        return new DesktopGitHubTokenSource(url, serviceToken, rest);
    }

    private void relayAnswers(Map<String, Object> body) {
        when(rest.exchange(eq(RELAY), eq(HttpMethod.GET), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
            .thenReturn(ResponseEntity.ok(body));
    }

    private void relayFails(RuntimeException failure) {
        when(rest.exchange(eq(RELAY), eq(HttpMethod.GET), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
            .thenThrow(failure);
    }

    @Test
    @DisplayName("le jeton de la personne, demandé à la coque avec le jeton de service, gardé un moment")
    void reads_the_persons_token_from_the_shell() {
        DesktopGitHubTokenSource tokens = tokens("http://127.0.0.1:4100/", "tfgh_service");
        relayAnswers(Map.of("token", "gho_person"));

        assertThat(tokens.token(3L)).contains("gho_person");
        assertThat(tokens.token(null)).contains("gho_person");

        ArgumentCaptor<HttpEntity<Void>> request = ArgumentCaptor.forClass(HttpEntity.class);
        verify(rest, times(1)).exchange(eq(RELAY), eq(HttpMethod.GET), request.capture(), any(ParameterizedTypeReference.class));
        assertThat(request.getValue().getHeaders().getFirst(HttpHeaders.AUTHORIZATION)).isEqualTo("Bearer tfgh_service");
        assertThat(tokens.personal()).isTrue();
        assertThat(tokens.missingHint()).contains("Settings > Agents");
        assertThat(tokens.refusedHint()).contains("Settings > Agents");
        assertThat(tokens.accountLabel()).isEqualTo("your GitHub account");
    }

    @Test
    @DisplayName("personne connectée à GitHub : pas de jeton, et l'absence n'est pas gardée")
    void nobody_signed_in() {
        DesktopGitHubTokenSource tokens = tokens("http://127.0.0.1:4100", "tfgh_service");
        relayFails(HttpClientErrorException.create(HttpStatus.NOT_FOUND, "Not Found", HttpHeaders.EMPTY, new byte[0],
            StandardCharsets.UTF_8));

        assertThat(tokens.token(3L)).isEmpty();
        assertThat(tokens.token(3L)).isEmpty();
        verify(rest, times(2)).exchange(eq(RELAY), eq(HttpMethod.GET), any(HttpEntity.class), any(ParameterizedTypeReference.class));
    }

    @Test
    @DisplayName("coque injoignable ou réponse vide : pas de jeton, sans erreur")
    void shell_unreachable() {
        DesktopGitHubTokenSource tokens = tokens("http://127.0.0.1:4100", "tfgh_service");
        relayFails(new ResourceAccessException("Connection refused"));
        assertThat(tokens.token(3L)).isEmpty();

        DesktopGitHubTokenSource empty = new DesktopGitHubTokenSource("http://127.0.0.1:4100", "tfgh_service", mock(RestTemplate.class));
        assertThat(empty.token(3L)).isEmpty();
    }

    @Test
    @DisplayName("sans relais configuré, la coque n'est jamais appelée")
    void no_relay() {
        assertThat(tokens("", "").token(3L)).isEmpty();
        assertThat(tokens("http://127.0.0.1:4100", null).token(3L)).isEmpty();
        verify(rest, never()).exchange(any(String.class), any(HttpMethod.class), any(HttpEntity.class),
            any(ParameterizedTypeReference.class));
    }
}
