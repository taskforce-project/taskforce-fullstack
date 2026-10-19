package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.UserTwoFactor;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.UserTwoFactorRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.security.TotpService;

@ExtendWith(MockitoExtension.class)
class TwoFactorServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private UserTwoFactorRepository repository;
    @Mock private TotpService totp;
    @Mock private KeycloakService keycloakService;
    @InjectMocks private TwoFactorService service;

    private static final String EMAIL = "pierre@example.com";
    private static final Long UID = 7L;
    private User user;

    @BeforeEach
    void setUp() {
        user = User.builder().email(EMAIL).build();
        ReflectionTestUtils.setField(user, "id", UID);
    }

    @ParameterizedTest(name = "TOTP de l'app {0}, application du compte en ligne {1} → {2}")
    @CsvSource({
        "false, false, false",
        "true, false, true",
        "false, true, true",
    })
    void isOnForAccount_combinesTheAppTotpAndTheAccountAuthenticator(boolean appTotp, boolean accountApp, boolean expected) {
        user.setKeycloakId("kc-7");
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        when(repository.existsByUserIdAndEnabledTrue(UID)).thenReturn(appTotp);
        if (!appTotp) {
            when(keycloakService.hasOneTimeCode("kc-7")).thenReturn(accountApp);
        }

        assertThat(service.isOnForAccount(EMAIL)).isEqualTo(expected);
    }

    @Test
    void isOnForAccount_unknownUser_isFalse() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
        assertThat(service.isOnForAccount(EMAIL)).isFalse();
    }

    @Test
    void isOnForAccount_accountServiceDown_reportsOnlyTheAppTotp() {
        user.setKeycloakId("kc-7");
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        when(keycloakService.hasOneTimeCode("kc-7")).thenThrow(new RuntimeException("connection refused"));
        assertThat(service.isOnForAccount(EMAIL)).isFalse();
    }

    @Test
    void verifyOrThrow_validCode_passes() {
        UserTwoFactor row = UserTwoFactor.builder().userId(UID).secret("S").enabled(true).build();
        when(repository.findByUserId(UID)).thenReturn(Optional.of(row));
        when(totp.verify("S", "123456")).thenReturn(true);
        service.verifyOrThrow(UID, "123456"); // ne lève pas
    }

    @Test
    void verifyOrThrow_invalidCode_throws() {
        UserTwoFactor row = UserTwoFactor.builder().userId(UID).secret("S").enabled(true).build();
        when(repository.findByUserId(UID)).thenReturn(Optional.of(row));
        when(totp.verify("S", "000000")).thenReturn(false);
        assertThatThrownBy(() -> service.verifyOrThrow(UID, "000000")).isInstanceOf(BusinessException.class);
    }

    @Test
    void verifyOrThrow_notEnabled_throws() {
        when(repository.findByUserId(UID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.verifyOrThrow(UID, "123456")).isInstanceOf(BusinessException.class);
    }

    @Test
    void verifyOrThrow_blocksAfterTooManyWrongCodes() {
        UserTwoFactor row = UserTwoFactor.builder().userId(UID).secret("S").enabled(true).build();
        when(repository.findByUserId(UID)).thenReturn(Optional.of(row));
        when(totp.verify("S", "000000")).thenReturn(false);

        // 6 tentatives ratées → chacune lève « invalide »
        for (int i = 0; i < 6; i++) {
            assertThatThrownBy(() -> service.verifyOrThrow(UID, "000000")).isInstanceOf(BusinessException.class);
        }
        // 7ᵉ : bloquée AVANT vérification (message différent)
        assertThatThrownBy(() -> service.verifyOrThrow(UID, "000000"))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("Wait a minute");
    }
}
