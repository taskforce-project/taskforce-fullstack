package com.taskforce.tf_api.core.service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.CreatePersonalAccessTokenRequest;
import com.taskforce.tf_api.core.dto.response.CreatedPersonalAccessTokenResponse;
import com.taskforce.tf_api.core.model.PersonalAccessToken;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.PersonalAccessTokenRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Jetons personnels (OSS-5.1) : la valeur ne sort qu'à la création, seule son empreinte est gardée, et un jeton
 * révoqué, expiré ou dont le compte est désactivé n'authentifie plus rien.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("PersonalAccessTokenService")
class PersonalAccessTokenServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 18, 12, 0);

    @Mock private PersonalAccessTokenRepository tokenRepository;
    @Mock private UserRepository userRepository;

    private PersonalAccessTokenService service;
    private User user;

    @BeforeEach
    void setUp() {
        ZoneId zone = ZoneId.systemDefault();
        Clock clock = Clock.fixed(NOW.atZone(zone).toInstant(), zone);
        service = new PersonalAccessTokenService(tokenRepository, userRepository, clock);
        user = User.builder().id(7L).email("ada@taskforce.dev").keycloakId("kc-7").isActive(true).build();
    }

    @ParameterizedTest(name = "expiration {0} jours")
    @NullSource
    @ValueSource(ints = {30, 90, 365})
    void create_returns_the_value_once_and_stores_its_hash(Integer days) {
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));
        when(tokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        CreatedPersonalAccessTokenResponse created = service.create(7L, new CreatePersonalAccessTokenRequest("  Laptop  ", days));

        ArgumentCaptor<PersonalAccessToken> saved = ArgumentCaptor.forClass(PersonalAccessToken.class);
        verify(tokenRepository).save(saved.capture());
        assertThat(created.value()).matches("^tfp_[A-Za-z0-9_-]{43}$");
        assertThat(saved.getValue().getTokenHash())
            .isEqualTo(PersonalAccessTokenService.sha256(created.value()))
            .doesNotContain(created.value().substring(4));
        assertThat(saved.getValue().getTokenHint()).isEqualTo(created.value().substring(0, 12));
        assertThat(saved.getValue().getName()).isEqualTo("Laptop");
        assertThat(saved.getValue().getExpiresAt()).isEqualTo(days == null ? null : NOW.plusDays(days));
        assertThat(created.token().hint()).isEqualTo(created.value().substring(0, 12));
    }

    @Test
    void two_tokens_never_share_a_value() {
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));
        when(tokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        String first = service.create(7L, new CreatePersonalAccessTokenRequest("a", null)).value();
        String second = service.create(7L, new CreatePersonalAccessTokenRequest("b", null)).value();

        assertThat(first).isNotEqualTo(second);
    }

    @Test
    void create_refuses_beyond_the_cap() {
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));
        when(tokenRepository.countByUserIdAndRevokedAtIsNull(7L)).thenReturn((long) PersonalAccessTokenService.MAX_ACTIVE_TOKENS);

        assertThatThrownBy(() -> service.create(7L, new CreatePersonalAccessTokenRequest("one more", null)))
            .isInstanceOf(BusinessException.class);
        verify(tokenRepository, never()).save(any());
    }

    @Test
    void list_marks_expired_tokens() {
        PersonalAccessToken live = token(t -> t.setExpiresAt(NOW.plusDays(1)));
        PersonalAccessToken old = token(t -> t.setExpiresAt(NOW.minusMinutes(1)));
        when(tokenRepository.findByUserIdAndRevokedAtIsNullOrderByCreatedAtDesc(7L)).thenReturn(List.of(live, old));

        assertThat(service.list(7L)).extracting(r -> r.expired()).containsExactly(false, true);
    }

    @Test
    void revoke_sets_the_revocation_date() {
        PersonalAccessToken token = token(t -> {});
        when(tokenRepository.findByIdAndUserIdAndRevokedAtIsNull(3L, 7L)).thenReturn(Optional.of(token));

        service.revoke(7L, 3L);

        assertThat(token.getRevokedAt()).isEqualTo(NOW);
        verify(tokenRepository).save(token);
    }

    @Test
    void revoke_of_someone_elses_token_is_not_found() {
        when(tokenRepository.findByIdAndUserIdAndRevokedAtIsNull(3L, 8L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.revoke(8L, 3L)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void authenticate_returns_the_person_and_touches_last_use() {
        String value = "tfp_" + "a".repeat(43);
        PersonalAccessToken token = token(t -> t.setTokenHash(PersonalAccessTokenService.sha256(value)));
        when(tokenRepository.findByTokenHashWithUser(PersonalAccessTokenService.sha256(value))).thenReturn(Optional.of(token));

        Optional<PersonalAccessTokenService.TokenPrincipal> principal = service.authenticate(value);

        assertThat(principal).contains(new PersonalAccessTokenService.TokenPrincipal(3L, 7L, "ada@taskforce.dev", "kc-7"));
        verify(tokenRepository).touch(3L, NOW);
    }

    @Test
    void authenticate_does_not_rewrite_a_recent_last_use() {
        String value = "tfp_" + "b".repeat(43);
        PersonalAccessToken token = token(t -> t.setLastUsedAt(NOW.minusMinutes(1)));
        when(tokenRepository.findByTokenHashWithUser(PersonalAccessTokenService.sha256(value))).thenReturn(Optional.of(token));

        assertThat(service.authenticate(value)).isPresent();
        verify(tokenRepository, never()).touch(anyLong(), any());
    }

    static Stream<Arguments> refusedTokens() {
        return Stream.of(
            Arguments.of("revoked", (Consumer<PersonalAccessToken>) t -> t.setRevokedAt(NOW.minusDays(1))),
            Arguments.of("expired", (Consumer<PersonalAccessToken>) t -> t.setExpiresAt(NOW)),
            Arguments.of("inactive account", (Consumer<PersonalAccessToken>) t -> t.getUser().setIsActive(false)));
    }

    @ParameterizedTest(name = "refusé : {0}")
    @MethodSource("refusedTokens")
    void authenticate_refuses(String label, Consumer<PersonalAccessToken> change) {
        String value = "tfp_" + "c".repeat(43);
        PersonalAccessToken token = token(change);
        when(tokenRepository.findByTokenHashWithUser(PersonalAccessTokenService.sha256(value))).thenReturn(Optional.of(token));

        assertThat(service.authenticate(value)).isEmpty();
        verify(tokenRepository, never()).touch(anyLong(), any());
    }

    @ParameterizedTest(name = "forme refusée sans lecture en base : [{0}]")
    @NullSource
    @ValueSource(strings = {"", "tfp_", "tfp_short", "eyJhbGciOiJSUzI1NiJ9.e30.sig", "tfp_" + "a!aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"})
    void authenticate_rejects_malformed_values_without_reading(String value) {
        assertThat(service.authenticate(value)).isEmpty();
        verify(tokenRepository, never()).findByTokenHashWithUser(any());
    }

    @Test
    void looks_like_token_only_for_the_prefix() {
        assertThat(PersonalAccessTokenService.looksLikeToken("tfp_x")).isTrue();
        assertThat(PersonalAccessTokenService.looksLikeToken("eyJhbGciOi")).isFalse();
        assertThat(PersonalAccessTokenService.looksLikeToken(null)).isFalse();
    }

    @Test
    void sha256_is_hex_of_64_characters() {
        assertThat(PersonalAccessTokenService.sha256("tfp_x")).matches("^[0-9a-f]{64}$");
    }

    private PersonalAccessToken token(Consumer<PersonalAccessToken> change) {
        PersonalAccessToken token = PersonalAccessToken.builder()
            .id(3L).user(user).name("Laptop").tokenHash("h").tokenHint("tfp_abcdefgh").build();
        token.setCreatedAt(NOW.minusDays(10));
        change.accept(token);
        return token;
    }
}
