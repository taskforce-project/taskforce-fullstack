package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.keycloak.representations.idm.UserRepresentation;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.DesktopAuthorizeRequest;
import com.taskforce.tf_api.core.dto.request.DesktopTokenRequest;
import com.taskforce.tf_api.core.dto.response.DesktopSessionResponse;
import com.taskforce.tf_api.core.model.DesktopSession;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.DesktopSessionRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

@ExtendWith(MockitoExtension.class)
@DisplayName("DesktopSessionService : connexion de l'app desktop par la webapp")
class DesktopSessionServiceTest {

    private static final String VERIFIER = "v".repeat(43);
    private static final String CHALLENGE = DesktopSessionService.s256(VERIFIER);
    private static final String REDIRECT = "http://127.0.0.1:47812/callback";
    private static final String STATE = "state-1234";

    @Mock private DesktopSessionRepository sessionRepository;
    @Mock private UserRepository userRepository;
    @Mock private KeycloakService keycloakService;
    @Mock private DesktopProfileReader profileReader;

    private MutableClock clock;
    private DesktopSessionService service;
    private User ada;

    /** Horloge qu'un test fait avancer. */
    static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-10-19T20:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    @BeforeEach
    void setUp() {
        clock = new MutableClock();
        service = new DesktopSessionService(sessionRepository, userRepository, keycloakService, profileReader, clock);
        ada = User.builder().id(7L).email("ada@example.com").keycloakId("kc-ada").isActive(true).build();
        lenient().when(userRepository.findById(7L)).thenReturn(Optional.of(ada));
        UserRepresentation kc = new UserRepresentation();
        kc.setFirstName("Ada");
        kc.setLastName("Lovelace");
        lenient().when(keycloakService.getUserById("kc-ada")).thenReturn(kc);
        lenient().when(sessionRepository.save(any(DesktopSession.class))).thenAnswer(invocation -> {
            DesktopSession session = invocation.getArgument(0);
            if (session.getId() == null) {
                session.setId(42L);
            }
            return session;
        });
    }

    private static Map<String, String> query(String url) {
        Map<String, String> params = new HashMap<>();
        for (String pair : URI.create(url).getRawQuery().split("&")) {
            String[] kv = pair.split("=", 2);
            params.put(kv[0], kv[1]);
        }
        return params;
    }

    private String authorize() {
        String url = service.authorize(7L, new DesktopAuthorizeRequest(CHALLENGE, REDIRECT, STATE));
        return query(url).get("code");
    }

    private DesktopTokenRequest tokenRequest(String code) {
        return new DesktopTokenRequest(code, VERIFIER, REDIRECT, "Windows");
    }

    @Nested
    @DisplayName("accord dans la webapp")
    class Authorize {

        @Test
        @DisplayName("renvoie vers l'app avec un code et l'état tel quel")
        void redirects_to_the_app() {
            String url = service.authorize(7L, new DesktopAuthorizeRequest(CHALLENGE, REDIRECT, STATE));

            assertThat(url).startsWith(REDIRECT + "?code=");
            assertThat(query(url)).containsEntry("state", STATE);
            assertThat(query(url).get("code")).matches("[A-Za-z0-9_-]{43}");
        }

        @ParameterizedTest(name = "{0}")
        @ValueSource(strings = {
            "http://127.0.0.1:8080/callback",
            "http://localhost:47812/callback",
            "https://127.0.0.1:47812/callback",
            "http://127.0.0.1:47812/other",
            "http://127.0.0.1:47812/callback?next=x",
            "http://evil.example/callback",
        })
        @DisplayName("refuse toute adresse de retour qui n'est pas celle de l'app")
        void refuses_other_redirects(String redirect) {
            assertThatThrownBy(() -> service.authorize(7L, new DesktopAuthorizeRequest(CHALLENGE, redirect, STATE)))
                .isInstanceOf(BusinessException.class);
        }

        @ParameterizedTest(name = "défi « {0} »")
        @ValueSource(strings = {"short", "has spaces in the challenge value that is long enough!!"})
        @DisplayName("refuse un défi PKCE mal formé")
        void refuses_a_bad_challenge(String challenge) {
            assertThatThrownBy(() -> service.authorize(7L, new DesktopAuthorizeRequest(challenge, REDIRECT, STATE)))
                .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("refuse un état mal formé")
        void refuses_a_bad_state() {
            assertThatThrownBy(() -> service.authorize(7L, new DesktopAuthorizeRequest(CHALLENGE, REDIRECT, "a b")))
                .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("refuse un compte désactivé")
        void refuses_an_inactive_account() {
            ada.setIsActive(false);

            assertThatThrownBy(() -> service.authorize(7L, new DesktopAuthorizeRequest(CHALLENGE, REDIRECT, STATE)))
                .isInstanceOf(BusinessException.class);
        }
    }

    @Nested
    @DisplayName("échange du code par l'app")
    class Exchange {

        @Test
        @DisplayName("ouvre une session : jeton rendu une fois, seule son empreinte est gardée")
        void opens_a_session() {
            DesktopSessionResponse response = service.exchange(tokenRequest(authorize()));

            ArgumentCaptor<DesktopSession> saved = ArgumentCaptor.forClass(DesktopSession.class);
            verify(sessionRepository).save(saved.capture());
            assertThat(response.token()).startsWith(DesktopSessionService.PREFIX).hasSize(47);
            assertThat(saved.getValue().getTokenHash()).isEqualTo(DesktopSessionService.sha256(response.token()));
            assertThat(saved.getValue().getTokenHash()).doesNotContain(response.token());
            assertThat(saved.getValue().getName()).isEqualTo("Windows");
            assertThat(response.expiresAt()).isEqualTo(LocalDateTime.of(2027, 1, 17, 20, 0));
            assertThat(response.account()).satisfies(account -> {
                assertThat(account.subject()).isEqualTo("kc-ada");
                assertThat(account.email()).isEqualTo("ada@example.com");
                assertThat(account.givenName()).isEqualTo("Ada");
                assertThat(account.familyName()).isEqualTo("Lovelace");
            });
        }

        @Test
        @DisplayName("un code ne sert qu'une fois, même après un mauvais vérificateur")
        void a_code_is_used_once() {
            String code = authorize();

            assertThatThrownBy(() -> service.exchange(new DesktopTokenRequest(code, "w".repeat(43), REDIRECT, null)))
                .isInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> service.exchange(tokenRequest(code))).isInstanceOf(BusinessException.class);
            verify(sessionRepository, never()).save(any());
        }

        @Test
        @DisplayName("un code expire au bout de deux minutes")
        void a_code_expires() {
            String code = authorize();
            clock.advance(Duration.ofMinutes(2));

            assertThatThrownBy(() -> service.exchange(tokenRequest(code))).isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("l'adresse de retour doit être celle de l'accord")
        void the_redirect_must_match() {
            String code = authorize();

            assertThatThrownBy(() -> service.exchange(new DesktopTokenRequest(code, VERIFIER, "http://127.0.0.1:47813/callback", null)))
                .isInstanceOf(BusinessException.class);
        }

        @ParameterizedTest(name = "code « {0} »")
        @ValueSource(strings = {"", "not-a-code", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"})
        @DisplayName("un code inconnu ou mal formé est refusé")
        void unknown_codes_are_refused(String code) {
            assertThatThrownBy(() -> service.exchange(tokenRequest(code))).isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("le compte rendu porte ses réglages (récupération du compte)")
        void the_account_carries_its_settings() {
            com.taskforce.tf_api.core.dto.response.DesktopProfileResponse profile =
                new com.taskforce.tf_api.core.dto.response.DesktopProfileResponse("Engineering lead", true, null, java.util.List.of());
            when(profileReader.read(ada)).thenReturn(profile);

            DesktopSessionResponse response = service.exchange(new DesktopTokenRequest(authorize(), VERIFIER, REDIRECT, "PC"));

            assertThat(response.account().profile()).isEqualTo(profile);
        }

        @Test
        @DisplayName("des réglages illisibles n'empêchent pas la connexion : l'app fera son onboarding")
        void opens_without_settings() {
            when(profileReader.read(ada)).thenThrow(new RuntimeException("db down"));

            DesktopSessionResponse response = service.exchange(new DesktopTokenRequest(authorize(), VERIFIER, REDIRECT, "PC"));

            assertThat(response.account().profile()).isNull();
            assertThat(response.account().email()).isEqualTo("ada@example.com");
        }

        @Test
        @DisplayName("sans nom lisible chez Keycloak, la session s'ouvre avec l'adresse seule")
        void opens_without_a_name() {
            when(keycloakService.getUserById("kc-ada")).thenThrow(new RuntimeException("down"));

            DesktopSessionResponse response = service.exchange(new DesktopTokenRequest(authorize(), VERIFIER, REDIRECT, "  "));

            assertThat(response.account().givenName()).isEmpty();
            assertThat(response.account().email()).isEqualTo("ada@example.com");
        }

        @Test
        @DisplayName("au-delà de vingt sessions, la moins récemment utilisée se ferme")
        void retires_the_oldest_session() {
            List<DesktopSession> active = new ArrayList<>();
            for (int i = 0; i < DesktopSessionService.MAX_ACTIVE_SESSIONS; i++) {
                DesktopSession session = DesktopSession.builder().id((long) i).user(ada).name("Windows").tokenHash("h" + i)
                    .expiresAt(LocalDateTime.of(2027, 1, 1, 0, 0)).lastUsedAt(LocalDateTime.of(2026, 10, 1, 0, 0).plusHours(i)).build();
                active.add(session);
            }
            when(sessionRepository.findByUserIdAndRevokedAtIsNullOrderByCreatedAtDesc(7L)).thenReturn(active);

            service.exchange(tokenRequest(authorize()));

            assertThat(active.stream().filter(s -> s.getRevokedAt() != null)).hasSize(1);
            assertThat(active.get(0).getRevokedAt()).isNotNull();
        }
    }

    @Nested
    @DisplayName("relecture du compte au lancement de l'app")
    class Refresh {

        private DesktopSession session(String token) {
            return DesktopSession.builder().id(42L).user(ada).name("Windows").tokenHash(DesktopSessionService.sha256(token))
                .expiresAt(LocalDateTime.of(2026, 12, 1, 0, 0)).lastUsedAt(LocalDateTime.of(2026, 10, 19, 10, 0)).build();
        }

        @Test
        @DisplayName("rend le compte et prolonge la session")
        void reads_the_account_and_extends() {
            String token = DesktopSessionService.PREFIX + "a".repeat(43);
            DesktopSession session = session(token);
            when(sessionRepository.findByTokenHashWithUser(DesktopSessionService.sha256(token))).thenReturn(Optional.of(session));

            Optional<DesktopSessionResponse> response = service.refresh(token);

            assertThat(response).isPresent();
            assertThat(response.get().token()).isNull();
            assertThat(response.get().account().subject()).isEqualTo("kc-ada");
            assertThat(session.getExpiresAt()).isEqualTo(LocalDateTime.of(2027, 1, 17, 20, 0));
            assertThat(session.getLastUsedAt()).isEqualTo(LocalDateTime.of(2026, 10, 19, 20, 0));
        }

        @Test
        @DisplayName("revue moins d'une heure après, la session n'est pas réécrite")
        void touches_at_most_hourly() {
            String token = DesktopSessionService.PREFIX + "b".repeat(43);
            DesktopSession session = session(token);
            session.setLastUsedAt(LocalDateTime.of(2026, 10, 19, 19, 30));
            when(sessionRepository.findByTokenHashWithUser(anyString())).thenReturn(Optional.of(session));

            assertThat(service.refresh(token)).isPresent();
            verify(sessionRepository, never()).save(any());
        }

        @Test
        @DisplayName("une session fermée, expirée ou d'un compte désactivé ne rend rien")
        void ended_sessions_return_nothing() {
            String token = DesktopSessionService.PREFIX + "c".repeat(43);
            DesktopSession revoked = session(token);
            revoked.setRevokedAt(LocalDateTime.of(2026, 10, 18, 0, 0));
            when(sessionRepository.findByTokenHashWithUser(anyString())).thenReturn(Optional.of(revoked));
            assertThat(service.refresh(token)).isEmpty();

            DesktopSession expired = session(token);
            expired.setExpiresAt(LocalDateTime.of(2026, 10, 19, 19, 0));
            when(sessionRepository.findByTokenHashWithUser(anyString())).thenReturn(Optional.of(expired));
            assertThat(service.refresh(token)).isEmpty();

            ada.setIsActive(false);
            when(sessionRepository.findByTokenHashWithUser(anyString())).thenReturn(Optional.of(session(token)));
            assertThat(service.refresh(token)).isEmpty();
        }

        @ParameterizedTest(name = "jeton « {0} »")
        @ValueSource(strings = {"", "tfp_abc", "tfa_short"})
        @DisplayName("un jeton mal formé n'interroge pas la base")
        void malformed_tokens(String token) {
            assertThat(service.refresh(token)).isEmpty();
            verify(sessionRepository, never()).findByTokenHashWithUser(anyString());
        }
    }

    @Nested
    @DisplayName("fermeture")
    class Revoke {

        @Test
        @DisplayName("l'app ferme sa session")
        void the_app_signs_out() {
            String token = DesktopSessionService.PREFIX + "d".repeat(43);
            DesktopSession session = DesktopSession.builder().id(42L).user(ada).name("Windows")
                .tokenHash(DesktopSessionService.sha256(token)).expiresAt(LocalDateTime.of(2026, 12, 1, 0, 0)).build();
            when(sessionRepository.findByTokenHashWithUser(DesktopSessionService.sha256(token))).thenReturn(Optional.of(session));

            service.revoke(token);

            assertThat(session.getRevokedAt()).isEqualTo(LocalDateTime.of(2026, 10, 19, 20, 0));
        }

        @Test
        @DisplayName("un jeton inconnu ou mal formé ne fait rien")
        void unknown_tokens() {
            service.revoke("nope");
            service.revoke(null);
            service.revoke(DesktopSessionService.PREFIX + "e".repeat(43));

            verify(sessionRepository, never()).save(any());
        }

        @Test
        @DisplayName("les réglages listent les sessions en cours et en ferment une")
        void settings_list_and_close() {
            DesktopSession current = DesktopSession.builder().id(1L).user(ada).name("Windows").tokenHash("h1")
                .expiresAt(LocalDateTime.of(2026, 12, 1, 0, 0)).build();
            DesktopSession stale = DesktopSession.builder().id(2L).user(ada).name("Linux").tokenHash("h2")
                .expiresAt(LocalDateTime.of(2026, 10, 1, 0, 0)).build();
            when(sessionRepository.findByUserIdAndRevokedAtIsNullOrderByCreatedAtDesc(7L)).thenReturn(List.of(current, stale));
            when(sessionRepository.findByIdAndUserIdAndRevokedAtIsNull(1L, 7L)).thenReturn(Optional.of(current));

            assertThat(service.list(7L)).extracting("name").containsExactly("Windows");
            service.revoke(7L, 1L);
            assertThat(current.getRevokedAt()).isNotNull();
        }

        @Test
        @DisplayName("la session d'un autre compte n'existe pas")
        void other_accounts_sessions() {
            when(sessionRepository.findByIdAndUserIdAndRevokedAtIsNull(9L, 7L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.revoke(7L, 9L)).isInstanceOf(ResourceNotFoundException.class);
        }
    }

    @Test
    @DisplayName("le nom de l'ordinateur est nettoyé et borné")
    void device_names() {
        assertThat(DesktopSessionService.deviceName(null)).isEqualTo("TaskForce Desktop");
        assertThat(DesktopSessionService.deviceName("Win\ndows")).isEqualTo("Windows");
        assertThat(DesktopSessionService.deviceName("x".repeat(100))).hasSize(80);
    }
}
