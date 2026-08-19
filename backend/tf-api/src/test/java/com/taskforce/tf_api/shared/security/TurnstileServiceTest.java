package com.taskforce.tf_api.shared.security;

import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.util.MultiValueMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link TurnstileService}.
 *
 * <p>Le comportement à figer n'est pas « l'appel réussit » mais <b>ce que le service décide quand il
 * échoue</b>. Une dépendance externe placée dans le chemin de l'inscription doit avoir une politique
 * de panne explicite, et celle retenue ici est de <b>laisser passer</b> : refuser reviendrait à
 * laisser une indisponibilité de Cloudflare fermer les inscriptions, c'est-à-dire à offrir un déni
 * de service. Ces tests existent pour que ce choix ne puisse pas être inversé par accident.</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("TurnstileService")
class TurnstileServiceTest {

    private static final String SECRET = "0x4AAA-secret-de-test";

    @Mock private RestTemplate restTemplate;

    @Captor private ArgumentCaptor<HttpEntity<MultiValueMap<String, String>>> requeteCaptor;

    private TurnstileService actif() {
        return new TurnstileService(restTemplate, SECRET);
    }

    @Test
    @DisplayName("accepte quand Cloudflare répond success=true")
    void accepts_on_success() {
        when(restTemplate.postForObject(any(String.class), any(), eq(Map.class)))
            .thenReturn(Map.of("success", true));

        assertThat(actif().verify("jeton-valide", "203.0.113.7")).isNull();
    }

    @Test
    @DisplayName("refuse quand Cloudflare répond success=false")
    void rejects_on_failure() {
        when(restTemplate.postForObject(any(String.class), any(), eq(Map.class)))
            .thenReturn(Map.of("success", false, "error-codes", java.util.List.of("invalid-input-response")));

        assertThat(actif().verify("jeton-bidon", null))
            .containsIgnoringCase("échouée");
    }

    @ParameterizedTest(name = "jeton = « {0} » → refusé sans appel réseau")
    @DisplayName("refuse un jeton absent ou vide sans interroger Cloudflare")
    @NullAndEmptySource
    @ValueSource(strings = { "   " })
    void rejects_missing_token_without_calling_cloudflare(String token) {
        assertThat(actif().verify(token, null)).containsIgnoringCase("manquante");

        // Inutile de déranger un tiers pour constater qu'un champ est vide.
        verify(restTemplate, never()).postForObject(any(String.class), any(), eq(Map.class));
    }

    @Test
    @DisplayName("Cloudflare injoignable : laisse PASSER, délibérément")
    void allows_when_cloudflare_unreachable() {
        when(restTemplate.postForObject(any(String.class), any(), eq(Map.class)))
            .thenThrow(new RestClientException("connexion refusée"));

        // Refuser ici transformerait une panne extérieure en fermeture des inscriptions. Le défi
        // signé maison, lui, continue de filtrer — c'est tout l'intérêt d'avoir deux rideaux.
        assertThat(actif().verify("un-jeton", null)).isNull();
    }

    @Test
    @DisplayName("réponse vide de Cloudflare : laisse passer et journalise")
    void allows_on_empty_body() {
        when(restTemplate.postForObject(any(String.class), any(), eq(Map.class)))
            .thenReturn(null);

        assertThat(actif().verify("un-jeton", null)).isNull();
    }

    @Test
    @DisplayName("transmet le secret, le jeton et l'adresse IP à siteverify")
    void sends_secret_token_and_ip() {
        when(restTemplate.postForObject(any(String.class), requeteCaptor.capture(), eq(Map.class)))
            .thenReturn(Map.of("success", true));

        actif().verify("jeton-abc", "203.0.113.7");

        MultiValueMap<String, String> corps = requeteCaptor.getValue().getBody();
        assertThat(corps).isNotNull();
        assertThat(corps.getFirst("secret")).isEqualTo(SECRET);
        assertThat(corps.getFirst("response")).isEqualTo("jeton-abc");
        assertThat(corps.getFirst("remoteip")).isEqualTo("203.0.113.7");
    }

    @Test
    @DisplayName("omet remoteip quand l'adresse est inconnue")
    void omits_ip_when_absent() {
        when(restTemplate.postForObject(any(String.class), requeteCaptor.capture(), eq(Map.class)))
            .thenReturn(Map.of("success", true));

        actif().verify("jeton-abc", null);

        // Envoyer une clé vide ferait juger Cloudflare sur une adresse inexistante.
        assertThat(requeteCaptor.getValue().getBody()).isNotNull();
        assertThat(requeteCaptor.getValue().getBody().containsKey("remoteip")).isFalse();
    }

    @Test
    @DisplayName("sans clé secrète : inactif, tout passe, aucun appel réseau")
    void disabled_without_secret() {
        TurnstileService inactif = new TurnstileService(restTemplate, "");

        assertThat(inactif.isEnabled()).isFalse();
        assertThat(inactif.verify(null, null)).isNull();
        assertThat(inactif.verify("n-importe-quoi", null)).isNull();
        verify(restTemplate, never()).postForObject(any(String.class), any(), eq(Map.class));
    }

    @Test
    @DisplayName("avec une clé secrète : actif")
    void enabled_with_secret() {
        assertThat(actif().isEnabled()).isTrue();
    }
}