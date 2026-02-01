package com.taskforce.tf_api.core.service;

import com.taskforce.tf_api.core.dto.request.RegisterRequest;
import com.taskforce.tf_api.core.dto.response.RegisterResponse;
import com.taskforce.tf_api.core.enums.OtpType;
import com.taskforce.tf_api.core.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.AssertionsForClassTypes.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class AuthServiceTest {

    @Mock
    private KeycloakService keycloakService;

    @Mock
    private OtpService otpService;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private AuthService authService;

    private RegisterRequest registerRequest;

    @BeforeEach
    void setup() {
        registerRequest = RegisterRequest.builder()
                .email("test@example.com")
                .password("Password123!")
                .firstName("Test")
                .lastName("User")
                .build();
    }

    @Test
    @DisplayName("register - avec email valide et nouveau - devrait créer utilisateur et envoyer OTP")
    void register_withValidAndNewEmail_shouldCreateUserAndSendOtp() {
        // Given
        String keycloakId = "keycloak-123";
        when(userRepository.existsByEmail(registerRequest.getEmail())).thenReturn(false);
        when(keycloakService.emailExists(registerRequest.getEmail())).thenReturn(false);
        when(keycloakService.createUser(any(), any(), any(), any())).thenReturn(keycloakId);

        // When
        RegisterResponse response = authService.register(registerRequest);

        // Then
        assertThat(response.isOtpSent()).isTrue();
        verify(otpService).generateAndSendOtp(
                eq(registerRequest.getEmail()),
                eq(registerRequest.getFirstName()),
                eq(OtpType.EMAIL_VERIFICATION),
                isNull(),
                eq(keycloakId)
        );}
}
