package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.web.webauthn.api.Bytes;
import org.springframework.security.web.webauthn.api.CredentialRecord;
import org.springframework.security.web.webauthn.api.ImmutableCredentialRecord;
import org.springframework.security.web.webauthn.api.ImmutablePublicKeyCose;
import org.springframework.security.web.webauthn.api.ImmutablePublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialCreationOptions;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialParameters;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialRequestOptions;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialRpEntity;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialType;
import org.springframework.security.web.webauthn.api.UserVerificationRequirement;
import org.springframework.security.web.webauthn.management.ImmutableRelyingPartyRegistrationRequest;
import org.springframework.security.web.webauthn.management.PublicKeyCredentialCreationOptionsRequest;
import org.springframework.security.web.webauthn.management.RelyingPartyAuthenticationRequest;
import org.springframework.security.web.webauthn.management.RelyingPartyRegistrationRequest;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations;

import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.PasskeyResponse;
import com.taskforce.tf_api.core.dto.response.PasskeySignInOptionsResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

@ExtendWith(MockitoExtension.class)
@DisplayName("PasskeyService : passkeys de la webapp")
class PasskeyServiceTest {

    private static final Bytes HANDLE = Bytes.random();

    @Mock private WebAuthnRelyingPartyOperations relyingParty;
    @Mock private UserCredentialRepository credentials;
    @Mock private UserRepository userRepository;
    @Mock private AuthService authService;

    private MutableClock clock;
    private PasskeyService service;
    private User ada;

    static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-10-19T20:00:00Z");
        void advance(Duration duration) { now = now.plus(duration); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    @BeforeEach
    void setUp() {
        clock = new MutableClock();
        service = new PasskeyService(relyingParty, credentials, userRepository, authService, clock);
        ada = User.builder().id(7L).email("ada@example.com").keycloakId("kc-ada").passkeyHandle(HANDLE.toBase64UrlString()).isActive(true).build();
        lenient().when(userRepository.findById(7L)).thenReturn(Optional.of(ada));
    }

    private static PublicKeyCredentialCreationOptions creationOptions() {
        return PublicKeyCredentialCreationOptions.builder()
            .rp(PublicKeyCredentialRpEntity.builder().id("app.example.com").name("TaskForce").build())
            .user(ImmutablePublicKeyCredentialUserEntity.builder().name("ada@example.com").id(HANDLE).displayName("Ada").build())
            .challenge(Bytes.random())
            .pubKeyCredParams(PublicKeyCredentialParameters.ES256, PublicKeyCredentialParameters.RS256)
            .timeout(Duration.ofMinutes(5))
            .excludeCredentials(List.of())
            .build();
    }

    private static PublicKeyCredentialRequestOptions requestOptions() {
        return PublicKeyCredentialRequestOptions.builder()
            .challenge(Bytes.random())
            .rpId("app.example.com")
            .timeout(Duration.ofMinutes(5))
            .allowCredentials(List.of())
            .userVerification(UserVerificationRequirement.REQUIRED)
            .build();
    }

    private static CredentialRecord record(String label, Instant created) {
        return ImmutableCredentialRecord.builder()
            .credentialType(PublicKeyCredentialType.PUBLIC_KEY)
            .credentialId(Bytes.random())
            .userEntityUserId(HANDLE)
            .publicKey(new ImmutablePublicKeyCose(new byte[] {1, 2, 3}))
            .signatureCount(0)
            .uvInitialized(true)
            .backupEligible(true)
            .backupState(true)
            .created(created)
            .lastUsed(created)
            .label(label)
            .build();
    }

    /** Réponse du navigateur au format JSON de WebAuthn ; le contenu n'est vérifié que par Spring Security (simulé ici). */
    private static Map<String, Object> attestation() {
        String id = Bytes.random().toBase64UrlString();
        return Map.of("id", id, "rawId", id, "type", "public-key", "clientExtensionResults", Map.of(),
            "authenticatorAttachment", "platform",
            "response", Map.of("attestationObject", Bytes.random().toBase64UrlString(),
                "clientDataJSON", Bytes.random().toBase64UrlString(), "transports", List.of("internal", "hybrid")));
    }

    private static Map<String, Object> assertion() {
        String id = Bytes.random().toBase64UrlString();
        return Map.of("id", id, "rawId", id, "type", "public-key", "clientExtensionResults", Map.of(),
            "authenticatorAttachment", "platform",
            "response", Map.of("authenticatorData", Bytes.random().toBase64UrlString(),
                "clientDataJSON", Bytes.random().toBase64UrlString(), "signature", Bytes.random().toBase64UrlString(),
                "userHandle", HANDLE.toBase64UrlString()));
    }

    @Nested
    @DisplayName("ajout d'une passkey")
    class Register {

        @Test
        @DisplayName("les options partent au format JSON de WebAuthn, au nom du compte")
        void options_in_webauthn_json() {
            when(credentials.findByUserId(HANDLE)).thenReturn(List.of());
            when(relyingParty.createPublicKeyCredentialCreationOptions(any())).thenReturn(creationOptions());

            Map<String, Object> options = service.registrationOptions(7L);

            ArgumentCaptor<PublicKeyCredentialCreationOptionsRequest> request = ArgumentCaptor.forClass(PublicKeyCredentialCreationOptionsRequest.class);
            verify(relyingParty).createPublicKeyCredentialCreationOptions(request.capture());
            assertThat(request.getValue().getAuthentication().getName()).isEqualTo("ada@example.com");
            assertThat(options).containsKeys("challenge", "rp", "user", "pubKeyCredParams");
            assertThat(((Map<?, ?>) options.get("user")).get("id")).isEqualTo(HANDLE.toBase64UrlString());
        }

        @Test
        @DisplayName("enregistre la passkey créée pour le défi en cours, avec son nom")
        void registers_the_created_passkey() {
            when(relyingParty.createPublicKeyCredentialCreationOptions(any())).thenReturn(creationOptions());
            service.registrationOptions(7L);
            CredentialRecord saved = record("Windows Hello", Instant.parse("2026-10-19T20:00:00Z"));
            when(relyingParty.registerCredential(any())).thenReturn(saved);

            PasskeyResponse passkey = service.register(7L, "  Windows Hello ", attestation());

            ArgumentCaptor<RelyingPartyRegistrationRequest> request = ArgumentCaptor.forClass(RelyingPartyRegistrationRequest.class);
            verify(relyingParty).registerCredential(request.capture());
            assertThat(request.getValue()).isInstanceOf(ImmutableRelyingPartyRegistrationRequest.class);
            assertThat(request.getValue().getPublicKey().getLabel()).isEqualTo("Windows Hello");
            assertThat(request.getValue().getPublicKey().getCredential().getResponse().getTransports()).isNotEmpty();
            assertThat(passkey.label()).isEqualTo("Windows Hello");
            assertThat(passkey.createdAt()).isEqualTo(LocalDateTime.of(2026, 10, 19, 20, 0));
        }

        @Test
        @DisplayName("sans défi en cours, ou après cinq minutes, l'ajout est refusé")
        void needs_a_fresh_challenge() {
            assertThatThrownBy(() -> service.register(7L, null, attestation())).isInstanceOf(BusinessException.class);

            when(relyingParty.createPublicKeyCredentialCreationOptions(any())).thenReturn(creationOptions());
            service.registrationOptions(7L);
            clock.advance(Duration.ofMinutes(5));
            assertThatThrownBy(() -> service.register(7L, null, attestation())).isInstanceOf(BusinessException.class);
            verify(relyingParty, never()).registerCredential(any());
        }

        @Test
        @DisplayName("une réponse que Spring Security refuse n'ajoute rien")
        void refused_answers() {
            when(relyingParty.createPublicKeyCredentialCreationOptions(any())).thenReturn(creationOptions());
            service.registrationOptions(7L);
            when(relyingParty.registerCredential(any())).thenThrow(new IllegalArgumentException("bad origin"));

            assertThatThrownBy(() -> service.register(7L, "x", attestation()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("couldn't be added");
        }

        @Test
        @DisplayName("une réponse illisible est refusée")
        void unreadable_answers() {
            when(relyingParty.createPublicKeyCredentialCreationOptions(any())).thenReturn(creationOptions());
            service.registrationOptions(7L);

            assertThatThrownBy(() -> service.register(7L, "x", Map.of("response", "nope")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("couldn't be read");
        }

        @Test
        @DisplayName("vingt passkeys au plus")
        void at_most_twenty() {
            List<CredentialRecord> many = new ArrayList<>();
            for (int i = 0; i < PasskeyService.MAX_PASSKEYS; i++) {
                many.add(record("Key " + i, Instant.parse("2026-10-01T00:00:00Z")));
            }
            when(credentials.findByUserId(HANDLE)).thenReturn(many);

            assertThatThrownBy(() -> service.registrationOptions(7L)).isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("un compte désactivé n'ajoute rien")
        void inactive_accounts() {
            ada.setIsActive(false);

            assertThatThrownBy(() -> service.registrationOptions(7L)).isInstanceOf(ResourceNotFoundException.class);
        }
    }

    @Nested
    @DisplayName("liste et retrait")
    class ListAndDelete {

        @Test
        @DisplayName("la plus récente d'abord ; aucune passkey sans identifiant WebAuthn")
        void lists_newest_first() {
            CredentialRecord older = record("Phone", Instant.parse("2026-10-01T00:00:00Z"));
            CredentialRecord newer = record("Windows Hello", Instant.parse("2026-10-19T00:00:00Z"));
            when(credentials.findByUserId(HANDLE)).thenReturn(List.of(older, newer));

            assertThat(service.list(7L)).extracting(PasskeyResponse::label).containsExactly("Windows Hello", "Phone");

            ada.setPasskeyHandle(null);
            assertThat(service.list(7L)).isEmpty();
        }

        @Test
        @DisplayName("retire une passkey du compte")
        void deletes_own_passkey() {
            CredentialRecord passkey = record("Phone", Instant.parse("2026-10-01T00:00:00Z"));
            when(credentials.findByCredentialId(passkey.getCredentialId())).thenReturn(passkey);

            service.delete(7L, passkey.getCredentialId().toBase64UrlString());

            verify(credentials).delete(passkey.getCredentialId());
        }

        @Test
        @DisplayName("la passkey d'un autre compte, ou inconnue, n'existe pas")
        void other_accounts_passkeys() {
            CredentialRecord foreign = ImmutableCredentialRecord.fromCredentialRecord(record("x", Instant.now()))
                .userEntityUserId(Bytes.random()).build();
            when(credentials.findByCredentialId(foreign.getCredentialId())).thenReturn(foreign);

            assertThatThrownBy(() -> service.delete(7L, foreign.getCredentialId().toBase64UrlString()))
                .isInstanceOf(ResourceNotFoundException.class);
            assertThatThrownBy(() -> service.delete(7L, " ")).isInstanceOf(ResourceNotFoundException.class);
            verify(credentials, never()).delete(any());
        }
    }

    @Nested
    @DisplayName("connexion")
    class SignIn {

        @Test
        @DisplayName("ouvre la session du compte de la passkey, pour un défi qui ne sert qu'une fois")
        void signs_in_once() {
            when(relyingParty.createCredentialRequestOptions(any())).thenReturn(requestOptions());
            PasskeySignInOptionsResponse challenge = service.signInOptions();
            when(relyingParty.authenticate(any())).thenReturn(
                ImmutablePublicKeyCredentialUserEntity.builder().name("ada@example.com").id(HANDLE).displayName("Ada").build());
            when(userRepository.findByPasskeyHandle(HANDLE.toBase64UrlString())).thenReturn(Optional.of(ada));
            AuthResponse session = AuthResponse.builder().accessToken("at").build();
            when(authService.completePasskeyLogin(7L)).thenReturn(session);

            assertThat(service.signIn(challenge.requestId(), assertion())).isSameAs(session);
            assertThat(challenge.options()).containsKeys("challenge", "rpId");

            ArgumentCaptor<RelyingPartyAuthenticationRequest> request = ArgumentCaptor.forClass(RelyingPartyAuthenticationRequest.class);
            verify(relyingParty).authenticate(request.capture());
            assertThat(request.getValue().getRequestOptions().getUserVerification()).isEqualTo(UserVerificationRequirement.REQUIRED);
            assertThatThrownBy(() -> service.signIn(challenge.requestId(), assertion())).isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("une passkey refusée ou inconnue n'ouvre rien")
        void refused_passkeys() {
            when(relyingParty.createCredentialRequestOptions(any())).thenReturn(requestOptions());
            String first = service.signInOptions().requestId();
            when(relyingParty.authenticate(any())).thenThrow(new IllegalArgumentException("bad signature"));
            assertThatThrownBy(() -> service.signIn(first, assertion())).isInstanceOf(BusinessException.class);

            String second = service.signInOptions().requestId();
            org.mockito.Mockito.reset(relyingParty);
            when(relyingParty.authenticate(any())).thenReturn(
                ImmutablePublicKeyCredentialUserEntity.builder().name("x").id(Bytes.random()).displayName("x").build());
            when(userRepository.findByPasskeyHandle(any())).thenReturn(Optional.empty());
            assertThatThrownBy(() -> service.signIn(second, assertion())).isInstanceOf(BusinessException.class);
            verify(authService, never()).completePasskeyLogin(any());
        }

        @Test
        @DisplayName("les défis en cours sont plafonnés, puis la place se libère quand ils expirent")
        void pending_sign_ins_are_capped() {
            when(relyingParty.createCredentialRequestOptions(any())).thenReturn(requestOptions());
            for (int i = 0; i < PasskeyService.MAX_PENDING_SIGN_INS; i++) {
                service.signInOptions();
            }
            assertThatThrownBy(() -> service.signInOptions()).isInstanceOf(BusinessException.class)
                .hasMessageContaining("Try again in a minute");

            clock.advance(Duration.ofMinutes(6));
            assertThat(service.signInOptions().requestId()).isNotBlank();
        }

        @Test
        @DisplayName("un défi inconnu ou vieux de cinq minutes est refusé")
        void stale_challenges() {
            assertThatThrownBy(() -> service.signIn("unknown", assertion())).isInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> service.signIn(null, assertion())).isInstanceOf(BusinessException.class);

            when(relyingParty.createCredentialRequestOptions(any())).thenReturn(requestOptions());
            String requestId = service.signInOptions().requestId();
            clock.advance(Duration.ofMinutes(6));
            assertThatThrownBy(() -> service.signIn(requestId, assertion())).isInstanceOf(BusinessException.class);
        }
    }

    @ParameterizedTest(name = "« {0} » -> « {1} »")
    @CsvSource(nullValues = "NULL", value = {"NULL, Passkey", "'   ', Passkey", "Windows Hello, Windows Hello"})
    @DisplayName("le nom d'une passkey est nettoyé")
    void labels(String requested, String expected) {
        assertThat(PasskeyService.label(requested)).isEqualTo(expected);
    }
}
