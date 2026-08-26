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
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.dto.response.TwoFactorSetupResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.UserTwoFactor;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.UserTwoFactorRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.TotpService;

@ExtendWith(MockitoExtension.class)
class TwoFactorServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private UserTwoFactorRepository repository;
    @Mock private TotpService totp;
    @InjectMocks private TwoFactorService service;

    private static final String EMAIL = "pierre@example.com";
    private static final Long UID = 7L;
    private User user;

    @BeforeEach
    void setUp() {
        user = User.builder().email(EMAIL).build();
        ReflectionTestUtils.setField(user, "id", UID);
    }

    @Test
    void setup_generatesSecret_createsPendingRow_returnsUri() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        when(repository.findByUserId(UID)).thenReturn(Optional.empty());
        when(totp.generateSecret()).thenReturn("SECRETBASE32");
        when(totp.buildUri("SECRETBASE32", EMAIL, "TaskForce")).thenReturn("otpauth://totp/TaskForce:pierre");

        TwoFactorSetupResponse res = service.setup(EMAIL);

        assertThat(res.getSecret()).isEqualTo("SECRETBASE32");
        assertThat(res.getOtpauthUri()).isEqualTo("otpauth://totp/TaskForce:pierre");
        ArgumentCaptor<UserTwoFactor> saved = ArgumentCaptor.forClass(UserTwoFactor.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo(UID);
        assertThat(saved.getValue().getSecret()).isEqualTo("SECRETBASE32");
        assertThat(saved.getValue().isEnabled()).isFalse(); // pas encore actif
    }

    @Test
    void setup_unknownUser_throws() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.setup(EMAIL)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void confirm_validCode_enables() {
        UserTwoFactor row = UserTwoFactor.builder().userId(UID).secret("S").enabled(false).build();
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        when(repository.findByUserId(UID)).thenReturn(Optional.of(row));
        when(totp.verify("S", "123456")).thenReturn(true);

        service.confirm(EMAIL, "123456");

        assertThat(row.isEnabled()).isTrue();
        assertThat(row.getConfirmedAt()).isNotNull();
        verify(repository).save(row);
    }

    @Test
    void confirm_invalidCode_throws_andDoesNotEnable() {
        UserTwoFactor row = UserTwoFactor.builder().userId(UID).secret("S").enabled(false).build();
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        when(repository.findByUserId(UID)).thenReturn(Optional.of(row));
        when(totp.verify("S", "000000")).thenReturn(false);

        assertThatThrownBy(() -> service.confirm(EMAIL, "000000")).isInstanceOf(BusinessException.class);
        assertThat(row.isEnabled()).isFalse();
        verify(repository, never()).save(any());
    }

    @Test
    void confirm_noPendingSetup_throws() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        when(repository.findByUserId(UID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.confirm(EMAIL, "123456")).isInstanceOf(BusinessException.class);
    }

    @Test
    void isEnabled_byEmail_delegatesToRepo() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        when(repository.existsByUserIdAndEnabledTrue(UID)).thenReturn(true);
        assertThat(service.isEnabled(EMAIL)).isTrue();
    }

    @Test
    void isEnabled_unknownUser_isFalse() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
        assertThat(service.isEnabled(EMAIL)).isFalse();
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
    void disable_deletesRow() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        service.disable(EMAIL);
        verify(repository).deleteByUserId(UID);
    }
}
