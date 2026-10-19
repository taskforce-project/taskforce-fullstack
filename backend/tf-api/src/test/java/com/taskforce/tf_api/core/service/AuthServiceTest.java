package com.taskforce.tf_api.core.service;

import com.taskforce.tf_api.core.dto.request.LoginRequest;
import com.taskforce.tf_api.core.dto.request.RegisterRequest;
import com.taskforce.tf_api.core.dto.request.VerifyOtpRequest;
import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.RegisterResponse;
import com.taskforce.tf_api.core.dto.response.VerifyOtpResponse;
import com.taskforce.tf_api.core.enums.OtpType;
import com.taskforce.tf_api.core.model.OtpVerification;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.security.HumanChallengeService;
import com.taskforce.tf_api.shared.security.OAuthTwoFactorChallenge;
import com.taskforce.tf_api.util.TestDataBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.keycloak.representations.idm.UserRepresentation;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Tests unitaires pour AuthService
 * Coverage attendu : 85-90%
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AuthService Tests")
class AuthServiceTest {

    @Mock
    private KeycloakService keycloakService;

    @Mock
    private KeycloakAuthService keycloakAuthService;

    @Mock
    private OtpService otpService;

    @Mock
    private EmailService emailService;

    @Mock
    private UserRepository userRepository;

    // Dépendances ajoutées à AuthService (auto-join workspace + invitations) que le test
    // ne mockait pas → @InjectMocks les laissait null → NPE dans login/verifyOtp. Cf. BT-P5.
    //
    // ⚠️ Le même oubli s'est reproduit le 24/07/2026 avec HumanChallengeService : 7 tests de
    // `register` sont tombés, dont 3 en NullPointerException. La leçon est mécanique — **ajouter une
    // dépendance au constructeur d'AuthService casse silencieusement ce fichier**, parce que
    // `@InjectMocks` n'injecte que ce qui est déclaré ici. Toute nouvelle dépendance doit donc
    // arriver accompagnée de son `@Mock`, dans le même changement.
    @Mock
    private WorkspaceService workspaceService;

    @Mock
    private AuditService auditService;

    @Mock
    private HumanChallengeService humanChallengeService;

    // 2FA (TOTP géré par l'app) : dépendance ajoutée au constructeur d'AuthService → DOIT être mockée
    // ici (sinon `@InjectMocks` la laisse null → NPE dans `login`). Cf. l'avertissement ci-dessus.
    @Mock
    private TwoFactorService twoFactorService;

    // Défi 2FA des connexions externes (OSS-1.1) : dépendance du constructeur, donc déclarée ici (cf.
    // l'avertissement ci-dessus). Instance RÉELLE espionnée : les tests scellent et ouvrent de vrais défis.
    @Spy
    private OAuthTwoFactorChallenge oauthTwoFactorChallenge = new OAuthTwoFactorChallenge("test-secret");

    @InjectMocks
    private AuthService authService;

    @Captor
    private ArgumentCaptor<User> userCaptor;

    private static final String TEST_EMAIL = "test@example.com";
    private static final String TEST_KEYCLOAK_ID = "keycloak-123";
    private static final String TEST_OTP_CODE = "123456";

    @Nested
    @DisplayName("Register Tests")
    class RegisterTests {

        private RegisterRequest registerRequest;

        @BeforeEach
        void setUp() {
            registerRequest = TestDataBuilder.buildRegisterRequest(TEST_EMAIL);
        }

        @Test
        @DisplayName("sans vérification d'e-mail (instance sans SMTP) : compte prêt tout de suite, aucun code envoyé")
        void register_withoutEmailVerification_completesTheAccountAtOnce() {
            org.springframework.test.util.ReflectionTestUtils.setField(authService, "signupEmailVerification", false);
            UserRepresentation created = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", false);
            created.setId(TEST_KEYCLOAK_ID);
            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.createUser(anyString(), anyString(), anyString(), anyString())).thenReturn(TEST_KEYCLOAK_ID);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(created);
            when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));

            RegisterResponse response = authService.register(registerRequest);

            assertThat(response.isOtpSent()).isFalse();
            assertThat(response.getMessage()).contains("You can now sign in");
            verify(keycloakService).verifyEmail(TEST_KEYCLOAK_ID);
            verify(userRepository).save(userCaptor.capture());
            assertThat(userCaptor.getValue().getEmail()).isEqualTo(TEST_EMAIL);
            verify(workspaceService).createWorkspace(userCaptor.getValue(), "Test");
            verifyNoInteractions(otpService);
            // Pas de SMTP : pas d'e-mail de bienvenue tenté.
            verify(emailService, never()).sendWelcomeEmail(anyString(), anyString());
        }

        @Test
        @DisplayName("sans vérification d'e-mail : un compte Keycloak resté non vérifié prend le mot de passe saisi")
        void register_withoutEmailVerification_takesOverAnUnverifiedAccount() {
            org.springframework.test.util.ReflectionTestUtils.setField(authService, "signupEmailVerification", false);
            UserRepresentation pending = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Old", "Name", false);
            pending.setId(TEST_KEYCLOAK_ID);
            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(true);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(pending);
            when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));

            RegisterResponse response = authService.register(registerRequest);

            assertThat(response.isOtpSent()).isFalse();
            verify(keycloakService).updatePassword(TEST_KEYCLOAK_ID, registerRequest.getPassword());
            verify(keycloakService).updateUserNames(TEST_KEYCLOAK_ID, registerRequest.getFirstName(), registerRequest.getLastName());
            verify(keycloakService).verifyEmail(TEST_KEYCLOAK_ID);
            verify(keycloakService, never()).createUser(anyString(), anyString(), anyString(), anyString());
        }

        @Test
        @DisplayName("devrait créer un nouvel utilisateur et envoyer OTP")
        void register_shouldCreateUserAndSendOtp_whenNewUser() {
            // Given
            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.createUser(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(TEST_KEYCLOAK_ID);
            when(otpService.generateAndSendOtp(anyString(), anyString(), any(), any(), anyString()))
                .thenReturn(TestDataBuilder.buildOtp());

            // When
            RegisterResponse response = authService.register(registerRequest);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.isOtpSent()).isTrue();
            assertThat(response.getEmail()).isEqualTo(TEST_EMAIL);
            assertThat(response.getMessage()).contains("verification code");

            verify(keycloakService).createUser(
                TEST_EMAIL,
                registerRequest.getPassword(),
                registerRequest.getFirstName(),
                registerRequest.getLastName()
            );
            verify(otpService).generateAndSendOtp(
                eq(TEST_EMAIL),
                eq(registerRequest.getFirstName()),
                eq(OtpType.EMAIL_VERIFICATION),
                isNull(),
                eq(TEST_KEYCLOAK_ID)
            );
        }

        @Test
        @DisplayName("devrait renvoyer OTP si utilisateur existe dans Keycloak mais non vérifié")
        void register_shouldResendOtp_whenUserExistsButNotVerified() {
            // Given
            UserRepresentation keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", false);
            keycloakUser.setId(TEST_KEYCLOAK_ID);

            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(true);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(otpService.generateAndSendOtp(anyString(), anyString(), any(), any(), anyString()))
                .thenReturn(TestDataBuilder.buildOtp());

            // When
            RegisterResponse response = authService.register(registerRequest);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.isOtpSent()).isTrue();

            verify(keycloakService, never()).createUser(anyString(), anyString(), anyString(), anyString());
            verify(otpService).generateAndSendOtp(
                eq(TEST_EMAIL),
                eq("Test"), // Prénom de Keycloak
                eq(OtpType.EMAIL_VERIFICATION),
                isNull(),
                eq(TEST_KEYCLOAK_ID)
            );
        }

        @Test
        @DisplayName("devrait lancer exception si email déjà vérifié dans Keycloak")
        void register_shouldThrowException_whenEmailAlreadyVerified() {
            // Given
            UserRepresentation keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", true);

            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(true);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);

            // When/Then
            assertThatThrownBy(() -> authService.register(registerRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("already verified");

            verify(otpService, never()).generateAndSendOtp(anyString(), anyString(), any(), any(), anyString());
        }

        @Test
        @DisplayName("devrait lancer exception si email existe déjà en DB")
        void register_shouldThrowException_whenEmailExistsInDb() {
            // Given
            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(true);

            // When/Then
            assertThatThrownBy(() -> authService.register(registerRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("already in use");

            verify(keycloakService, never()).createUser(anyString(), anyString(), anyString(), anyString());
        }

        @Test
        @DisplayName("refuse l'inscription quand la vérification humaine échoue, AVANT tout travail")
        void register_shouldRefuse_whenHumanChallengeFails() {
            // La vérification passe en premier, à dessein : elle protège précisément la création
            // Keycloak et l'envoi de courriels. La contrôler après aurait laissé passer le coût
            // qu'elle est censée éviter.
            when(humanChallengeService.verify(any()))
                .thenReturn("The form was submitted too quickly. Please try again.");

            assertThatThrownBy(() -> authService.register(registerRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("too quickly");

            verify(userRepository, never()).existsByEmail(anyString());
            verify(keycloakService, never()).createUser(anyString(), anyString(), anyString(), anyString());
            verify(otpService, never())
                .generateAndSendOtp(anyString(), anyString(), any(), any(), anyString());
        }

        @Test
        @DisplayName("devrait gérer race condition lors de la création utilisateur")
        void register_shouldHandleRaceCondition_whenUserCreatedMeanwhile() {
            // Given
            UserRepresentation keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", false);
            keycloakUser.setId(TEST_KEYCLOAK_ID);

            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.createUser(anyString(), anyString(), anyString(), anyString()))
                .thenThrow(new RuntimeException("User exists with same username"));
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(otpService.generateAndSendOtp(anyString(), anyString(), any(), any(), anyString()))
                .thenReturn(TestDataBuilder.buildOtp());

            // When
            RegisterResponse response = authService.register(registerRequest);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.isOtpSent()).isTrue();

            verify(keycloakService).getUserByEmail(TEST_EMAIL);
            verify(otpService).generateAndSendOtp(anyString(), anyString(), any(), any(), anyString());
        }

        @Test
        @DisplayName("devrait lancer exception si race condition avec email déjà vérifié")
        void register_shouldThrowException_whenRaceConditionWithVerifiedEmail() {
            // Given
            UserRepresentation keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", true);

            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.createUser(anyString(), anyString(), anyString(), anyString()))
                .thenThrow(new RuntimeException("User exists with same username"));
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);

            // When/Then
            assertThatThrownBy(() -> authService.register(registerRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("already verified");
        }

        @Test
        @DisplayName("devrait propager exception si erreur Keycloak différente de 'User exists'")
        void register_shouldPropagateException_whenDifferentKeycloakError() {
            // Given
            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.createUser(anyString(), anyString(), anyString(), anyString()))
                .thenThrow(new RuntimeException("Keycloak server error"));

            // When/Then
            assertThatThrownBy(() -> authService.register(registerRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("Keycloak server error");
        }
    }

    @Nested
    @DisplayName("VerifyOtp Tests")
    class VerifyOtpTests {

        private VerifyOtpRequest verifyRequest;
        private UserRepresentation keycloakUser;
        private OtpVerification otpVerification;

        @BeforeEach
        void setUp() {
            verifyRequest = TestDataBuilder.buildVerifyOtpRequest(TEST_EMAIL, TEST_OTP_CODE);
            keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", false);
            keycloakUser.setId(TEST_KEYCLOAK_ID);
            otpVerification = TestDataBuilder.buildOtp(TEST_EMAIL, TEST_OTP_CODE, OtpType.EMAIL_VERIFICATION);
            otpVerification.setKeycloakId(TEST_KEYCLOAK_ID);
        }

        @Test
        @DisplayName("devrait créer l'utilisateur et son workspace, puis renvoyer vers la connexion")
        void verifyOtp_shouldCreateUser_whenOtpValid() {
            // Given
            when(otpService.verifyOtpAndGetDetails(TEST_EMAIL, TEST_OTP_CODE)).thenReturn(otpVerification);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            doNothing().when(keycloakService).verifyEmail(TEST_KEYCLOAK_ID);
            when(userRepository.save(any(User.class))).thenAnswer(i -> {
                User user = i.getArgument(0);
                user.setId(1L);
                return user;
            });
            when(emailService.isEnabled()).thenReturn(true);
            doNothing().when(emailService).sendWelcomeEmail(anyString(), anyString());

            // When
            VerifyOtpResponse response = authService.verifyOtpAndCompleteRegistration(verifyRequest);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.getVerified()).isTrue();
            // Migration OIDC : plus d'auto-login post-inscription → redirection vers /login.
            assertThat(response.getAuthData()).isNull();

            verify(keycloakService).verifyEmail(TEST_KEYCLOAK_ID);
            verify(userRepository).save(userCaptor.capture());
            verify(emailService).sendWelcomeEmail(TEST_EMAIL, "Test");

            User savedUser = userCaptor.getValue();
            assertThat(savedUser.getEmail()).isEqualTo(TEST_EMAIL);
            assertThat(savedUser.getIsActive()).isTrue();
            verify(workspaceService).createWorkspace(savedUser, "Test");
        }

        @Test
        @DisplayName("devrait lancer exception si OTP invalide")
        void verifyOtp_shouldThrowException_whenOtpInvalid() {
            // Given
            when(otpService.verifyOtpAndGetDetails(TEST_EMAIL, TEST_OTP_CODE)).thenReturn(null);

            // When/Then
            assertThatThrownBy(() -> authService.verifyOtpAndCompleteRegistration(verifyRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Invalid or expired");

            verify(userRepository, never()).save(any(User.class));
        }
    }

    @Nested
    @DisplayName("Login Tests")
    class LoginTests {

        private LoginRequest loginRequest;
        private UserRepresentation keycloakUser;
        private User user;
        private KeycloakTokenResponse keycloakToken;

        @BeforeEach
        void setUp() {
            loginRequest = TestDataBuilder.buildLoginRequest(TEST_EMAIL, "Password123!");
            keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", true);
            keycloakUser.setId(TEST_KEYCLOAK_ID);
            user = TestDataBuilder.buildUser(TEST_EMAIL);
            user.setKeycloakId(TEST_KEYCLOAK_ID);
            
            keycloakToken = KeycloakTokenResponse.builder()
                .accessToken("keycloak_access_token")
                .refreshToken("keycloak_refresh_token")
                .tokenType("Bearer")
                .expiresIn(300)
                .refreshExpiresIn(1800)
                .build();
        }

        @Test
        @DisplayName("devrait authentifier avec succès et retourner tokens")
        void login_shouldAuthenticate_whenValidCredentials() {
            // Given
            when(keycloakAuthService.authenticate(TEST_EMAIL, "Password123!")).thenReturn(keycloakToken);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(userRepository.findByKeycloakId(TEST_KEYCLOAK_ID)).thenReturn(Optional.of(user));

            // When
            AuthResponse response = authService.login(loginRequest);

            // Then : la réponse porte directement les tokens émis par Keycloak
            assertThat(response).isNotNull();
            assertThat(response.getAccessToken()).isEqualTo("keycloak_access_token");
            assertThat(response.getRefreshToken()).isEqualTo("keycloak_refresh_token");

            verify(keycloakAuthService).authenticate(TEST_EMAIL, "Password123!");
        }

        @Test
        @DisplayName("devrait lancer exception si email non vérifié")
        void login_shouldThrowException_whenEmailNotVerified() {
            // Given
            keycloakUser.setEmailVerified(false);

            when(keycloakAuthService.authenticate(TEST_EMAIL, "Password123!")).thenReturn(keycloakToken);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);

            // When/Then
            assertThatThrownBy(() -> authService.login(loginRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("verify your email");

            verify(userRepository, never()).findByKeycloakId(anyString());
        }

        @Test
        @DisplayName("devrait lancer exception si compte désactivé")
        void login_shouldThrowException_whenAccountDisabled() {
            // Given
            user.setIsActive(false);

            when(keycloakAuthService.authenticate(TEST_EMAIL, "Password123!")).thenReturn(keycloakToken);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(userRepository.findByKeycloakId(TEST_KEYCLOAK_ID)).thenReturn(Optional.of(user));

            // When/Then
            assertThatThrownBy(() -> authService.login(loginRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("disabled");
        }

        @Test
        @DisplayName("devrait créer utilisateur en DB si existe seulement dans Keycloak")
        void login_shouldCreateUserInDb_whenOnlyInKeycloak() {
            // Given
            when(keycloakAuthService.authenticate(TEST_EMAIL, "Password123!")).thenReturn(keycloakToken);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(userRepository.findByKeycloakId(TEST_KEYCLOAK_ID)).thenReturn(Optional.empty());
            when(userRepository.save(any(User.class))).thenAnswer(i -> {
                User savedUser = i.getArgument(0);
                savedUser.setId(1L);
                return savedUser;
            });

            // When
            AuthResponse response = authService.login(loginRequest);

            // Then
            assertThat(response).isNotNull();

            verify(userRepository).save(userCaptor.capture());
            User createdUser = userCaptor.getValue();
            assertThat(createdUser.getEmail()).isEqualTo(TEST_EMAIL);
            assertThat(createdUser.getIsActive()).isTrue();
        }

        @Test
        @DisplayName("devrait lancer exception si credentials invalides")
        void login_shouldThrowException_whenInvalidCredentials() {
            // Given
            doThrow(new RuntimeException("Invalid email or password"))
                .when(keycloakAuthService).authenticate(TEST_EMAIL, "WrongPassword");

            loginRequest = TestDataBuilder.buildLoginRequest(TEST_EMAIL, "WrongPassword");

            // When/Then
            assertThatThrownBy(() -> authService.login(loginRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Invalid email or password");

            verify(userRepository, never()).findByKeycloakId(anyString());
        }

        @Test
        @DisplayName("2FA activé + sans code → twoFactorRequired, aucun token")
        void login_shouldRequireTwoFactor_whenEnabledAndNoCode() {
            when(keycloakAuthService.authenticate(TEST_EMAIL, "Password123!")).thenReturn(keycloakToken);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(userRepository.findByKeycloakId(TEST_KEYCLOAK_ID)).thenReturn(Optional.of(user));
            when(twoFactorService.isEnabled(user.getId())).thenReturn(true);

            AuthResponse response = authService.login(loginRequest);

            assertThat(response.getTwoFactorRequired()).isTrue();
            assertThat(response.getAccessToken()).isNull();
            verify(twoFactorService, never()).verifyOrThrow(anyLong(), anyString());
        }

        @Test
        @DisplayName("2FA activé + code valide → tokens")
        void login_shouldReturnTokens_whenEnabledAndValidCode() {
            loginRequest.setTotp("123456");
            when(keycloakAuthService.authenticate(TEST_EMAIL, "Password123!")).thenReturn(keycloakToken);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(userRepository.findByKeycloakId(TEST_KEYCLOAK_ID)).thenReturn(Optional.of(user));
            when(twoFactorService.isEnabled(user.getId())).thenReturn(true);

            AuthResponse response = authService.login(loginRequest);

            assertThat(response.getAccessToken()).isEqualTo("keycloak_access_token");
            verify(twoFactorService).verifyOrThrow(user.getId(), "123456");
        }

        @Test
        @DisplayName("2FA activé + code invalide → exception")
        void login_shouldThrow_whenEnabledAndInvalidCode() {
            loginRequest.setTotp("000000");
            when(keycloakAuthService.authenticate(TEST_EMAIL, "Password123!")).thenReturn(keycloakToken);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(userRepository.findByKeycloakId(TEST_KEYCLOAK_ID)).thenReturn(Optional.of(user));
            when(twoFactorService.isEnabled(user.getId())).thenReturn(true);
            doThrow(new BusinessException("Invalid authentication code"))
                .when(twoFactorService).verifyOrThrow(user.getId(), "000000");

            assertThatThrownBy(() -> authService.login(loginRequest))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Invalid authentication code");
        }
    }

    @Nested
    @DisplayName("ResendOtp Tests")
    class ResendOtpTests {

        private UserRepresentation keycloakUser;

        @BeforeEach
        void setUp() {
            keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", false);
            keycloakUser.setId(TEST_KEYCLOAK_ID);
        }

        @Test
        @DisplayName("devrait renvoyer un nouveau code de vérification")
        void resendOtp_shouldSendNewOtp() {
            // Given
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(otpService.generateAndSendOtp(anyString(), anyString(), any(), any(), anyString()))
                .thenReturn(TestDataBuilder.buildOtp());

            // When
            RegisterResponse response = authService.resendOtp(TEST_EMAIL);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.isOtpSent()).isTrue();
            assertThat(response.getMessage()).contains("new verification code");

            verify(otpService).generateAndSendOtp(
                eq(TEST_EMAIL),
                eq("Test"),
                eq(OtpType.EMAIL_VERIFICATION),
                isNull(),
                eq(TEST_KEYCLOAK_ID)
            );
        }

        @Test
        @DisplayName("devrait lancer exception si email déjà vérifié")
        void resendOtp_shouldThrowException_whenEmailAlreadyVerified() {
            // Given
            keycloakUser.setEmailVerified(true);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);

            // When/Then
            assertThatThrownBy(() -> authService.resendOtp(TEST_EMAIL))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("already verified");

            verify(otpService, never()).generateAndSendOtp(anyString(), anyString(), any(), any(), anyString());
        }
    }

    @Nested
    @DisplayName("ForgotPassword Tests")
    class ForgotPasswordTests {

        private UserRepresentation keycloakUser;

        @BeforeEach
        void setUp() {
            keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", true);
            keycloakUser.setId(TEST_KEYCLOAK_ID);
        }

        @Test
        @DisplayName("devrait envoyer OTP de reset password si utilisateur existe")
        void forgotPassword_shouldSendOtp_whenUserExists() {
            // Given
            when(emailService.isEnabled()).thenReturn(true);
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(true);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(otpService.generateAndSendOtp(anyString(), anyString(), any(), any(), anyString()))
                .thenReturn(TestDataBuilder.buildOtp());

            // When
            authService.forgotPassword(TEST_EMAIL);

            // Then
            verify(otpService).generateAndSendOtp(
                eq(TEST_EMAIL),
                eq("Test"),
                eq(OtpType.PASSWORD_RESET),
                isNull(),
                eq(TEST_KEYCLOAK_ID)
            );
        }

        @Test
        @DisplayName("devrait lancer exception si utilisateur non trouvé")
        void forgotPassword_shouldThrowException_whenUserNotFound() {
            // Given
            when(emailService.isEnabled()).thenReturn(true);
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(false);

            // When/Then
            assertThatThrownBy(() -> authService.forgotPassword(TEST_EMAIL))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("No account");

            verify(otpService, never()).generateAndSendOtp(anyString(), anyString(), any(), any(), anyString());
        }

        @Test
        @DisplayName("sans SMTP : message clair, aucun code généré ni compte cherché")
        void forgotPassword_withoutSmtp_saysItIsNotAvailable() {
            when(emailService.isEnabled()).thenReturn(false);

            assertThatThrownBy(() -> authService.forgotPassword(TEST_EMAIL))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("ask an administrator");

            verifyNoInteractions(keycloakService, otpService);
        }
    }

    @Nested
    @DisplayName("ResetPassword Tests")
    class ResetPasswordTests {

        private UserRepresentation keycloakUser;

        @BeforeEach
        void setUp() {
            keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", true);
            keycloakUser.setId(TEST_KEYCLOAK_ID);
        }

        @Test
        @DisplayName("devrait réinitialiser le mot de passe si OTP valide")
        void resetPassword_shouldUpdatePassword_whenOtpValid() {
            // Given
            String newPassword = "NewPassword123!";

            when(otpService.verifyOtpWithType(TEST_EMAIL, TEST_OTP_CODE, OtpType.PASSWORD_RESET)).thenReturn(true);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            doNothing().when(keycloakService).updatePassword(TEST_KEYCLOAK_ID, newPassword);
            doNothing().when(otpService).invalidateAllPendingOtps(TEST_EMAIL);

            // When
            authService.resetPassword(TEST_EMAIL, TEST_OTP_CODE, newPassword);

            // Then
            verify(keycloakService).updatePassword(TEST_KEYCLOAK_ID, newPassword);
            verify(otpService).invalidateAllPendingOtps(TEST_EMAIL);
        }

        @Test
        @DisplayName("devrait lancer exception si OTP invalide")
        void resetPassword_shouldThrowException_whenOtpInvalid() {
            // Given
            when(otpService.verifyOtpWithType(TEST_EMAIL, "WRONGCODE", OtpType.PASSWORD_RESET)).thenReturn(false);

            // When/Then
            assertThatThrownBy(() -> authService.resetPassword(TEST_EMAIL, "WRONGCODE", "NewPassword123!"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Invalid or expired");

            verify(keycloakService, never()).updatePassword(anyString(), anyString());
        }
    }

    @Nested
    @DisplayName("Connexion externe et 2FA (OSS-1.1)")
    class OAuthTwoFactorTests {

        private final Map<String, Object> profil = Map.of(
            "email", TEST_EMAIL, "given_name", "Ada", "family_name", "Lovelace",
            "sub", TEST_KEYCLOAK_ID, "email_verified", true);
        private final Map<String, Object> jetons = Map.of(
            "access_token", "kc-access", "refresh_token", "kc-refresh",
            "expires_in", 300, "refresh_expires_in", 1800);

        private User existingUser(boolean twoFactor) {
            User user = TestDataBuilder.buildUser(TEST_EMAIL);
            when(userRepository.findByEmail(TEST_EMAIL)).thenReturn(Optional.of(user));
            when(twoFactorService.isEnabled(user.getId())).thenReturn(twoFactor);
            return user;
        }

        @Test
        @DisplayName("sans 2FA, délivre la session directement")
        void completeOAuthLogin_withoutTwoFactor_returnsSession() {
            User user = existingUser(false);

            AuthResponse response = authService.completeOAuthLogin(profil, jetons);

            assertThat(response.getAccessToken()).isEqualTo("kc-access");
            assertThat(response.getRefreshToken()).isEqualTo("kc-refresh");
            assertThat(response.getTwoFactorChallenge()).isNull();
            verify(auditService).record(null, user.getId(), AuditService.USER_LOGIN);
        }

        @Test
        @DisplayName("avec 2FA, ne délivre aucun jeton, seulement un défi")
        void completeOAuthLogin_withTwoFactor_returnsChallengeOnly() {
            existingUser(true);

            AuthResponse response = authService.completeOAuthLogin(profil, jetons);

            assertThat(response.getTwoFactorRequired()).isTrue();
            assertThat(response.getTwoFactorChallenge()).isNotBlank();
            assertThat(response.getAccessToken()).isNull();
            assertThat(response.getRefreshToken()).isNull();
            verifyNoInteractions(auditService);
        }

        @Test
        @DisplayName("délivre la session une fois le code vérifié")
        void completeOAuthTwoFactor_withValidCode_returnsSession() {
            User user = existingUser(true);
            String challenge = authService.completeOAuthLogin(profil, jetons).getTwoFactorChallenge();
            when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));

            AuthResponse response = authService.completeOAuthTwoFactor(challenge, "123456");

            verify(twoFactorService).verifyOrThrow(user.getId(), "123456");
            assertThat(response.getAccessToken()).isEqualTo("kc-access");
            assertThat(response.getRefreshToken()).isEqualTo("kc-refresh");
            assertThat(response.getUser().getEmail()).isEqualTo(TEST_EMAIL);
            verify(auditService).record(null, user.getId(), AuditService.USER_LOGIN);
        }

        @Test
        @DisplayName("refuse un code invalide sans délivrer de session")
        void completeOAuthTwoFactor_withInvalidCode_throws() {
            User user = existingUser(true);
            String challenge = authService.completeOAuthLogin(profil, jetons).getTwoFactorChallenge();
            when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
            doThrow(new BusinessException("invalid code")).when(twoFactorService).verifyOrThrow(user.getId(), "000000");

            assertThatThrownBy(() -> authService.completeOAuthTwoFactor(challenge, "000000"))
                .isInstanceOf(BusinessException.class);
            verifyNoInteractions(auditService);
        }

        @ParameterizedTest(name = "refuse un code vide : « {0} »")
        @NullAndEmptySource
        @ValueSource(strings = {"   "})
        void completeOAuthTwoFactor_withoutCode_throws(String code) {
            User user = existingUser(true);
            String challenge = authService.completeOAuthLogin(profil, jetons).getTwoFactorChallenge();
            when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));

            assertThatThrownBy(() -> authService.completeOAuthTwoFactor(challenge, code))
                .isInstanceOf(BusinessException.class);
            verify(twoFactorService, never()).verifyOrThrow(anyLong(), anyString());
        }

        @Test
        @DisplayName("refuse un défi forgé sans toucher au 2FA")
        void completeOAuthTwoFactor_withForgedChallenge_throws() {
            assertThatThrownBy(() -> authService.completeOAuthTwoFactor("forged", "123456"))
                .isInstanceOf(BusinessException.class);
            verifyNoInteractions(twoFactorService, auditService);
        }

        @Test
        @DisplayName("refuse un compte désactivé depuis l'émission du défi")
        void completeOAuthTwoFactor_withDisabledAccount_throws() {
            User user = existingUser(true);
            String challenge = authService.completeOAuthLogin(profil, jetons).getTwoFactorChallenge();
            user.setIsActive(false);
            when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));

            assertThatThrownBy(() -> authService.completeOAuthTwoFactor(challenge, "123456"))
                .isInstanceOf(BusinessException.class);
            verify(twoFactorService, never()).verifyOrThrow(anyLong(), anyString());
        }
    }

    @Nested
    @DisplayName("completePasskeyLogin : session ouverte par une passkey")
    class PasskeyLoginTests {

        @Test
        @DisplayName("Keycloak ouvre la session par l'échange de jetons du backend, sans code en plus")
        void opens_the_session_without_a_code() {
            User user = User.builder().id(7L).email(TEST_EMAIL).keycloakId(TEST_KEYCLOAK_ID).isActive(true).build();
            when(userRepository.findById(7L)).thenReturn(java.util.Optional.of(user));
            when(keycloakAuthService.impersonate(TEST_KEYCLOAK_ID)).thenReturn(KeycloakTokenResponse.builder()
                .accessToken("at").refreshToken("rt").tokenType("Bearer").expiresIn(300).refreshExpiresIn(1800).build());
            org.keycloak.representations.idm.UserRepresentation kc = new org.keycloak.representations.idm.UserRepresentation();
            kc.setFirstName("Ada");
            kc.setLastName("Lovelace");
            when(keycloakService.getUserById(TEST_KEYCLOAK_ID)).thenReturn(kc);

            AuthResponse response = authService.completePasskeyLogin(7L);

            assertThat(response.getAccessToken()).isEqualTo("at");
            assertThat(response.getRefreshToken()).isEqualTo("rt");
            assertThat(response.getUser().getFirstName()).isEqualTo("Ada");
            verify(auditService).record(null, 7L, AuditService.USER_LOGIN);
            verify(twoFactorService, never()).verifyOrThrow(anyLong(), anyString());
        }

        @Test
        @DisplayName("sans nom lisible chez Keycloak, la session s'ouvre quand même")
        void opens_without_a_name() {
            User user = User.builder().id(7L).email(TEST_EMAIL).keycloakId(TEST_KEYCLOAK_ID).isActive(true).build();
            when(userRepository.findById(7L)).thenReturn(java.util.Optional.of(user));
            when(keycloakAuthService.impersonate(TEST_KEYCLOAK_ID)).thenReturn(KeycloakTokenResponse.builder()
                .accessToken("at").refreshToken("rt").expiresIn(300).refreshExpiresIn(1800).build());
            when(keycloakService.getUserById(TEST_KEYCLOAK_ID)).thenThrow(new RuntimeException("down"));

            assertThat(authService.completePasskeyLogin(7L).getUser().getFirstName()).isNull();
        }

        @Test
        @DisplayName("Keycloak qui refuse l'échange donne un message clair, pas une erreur du serveur")
        void keycloak_refuses_the_exchange() {
            User user = User.builder().id(7L).email(TEST_EMAIL).keycloakId(TEST_KEYCLOAK_ID).isActive(true).build();
            when(userRepository.findById(7L)).thenReturn(java.util.Optional.of(user));
            when(keycloakAuthService.impersonate(TEST_KEYCLOAK_ID))
                .thenThrow(new RuntimeException("The account service did not open a session"));

            assertThatThrownBy(() -> authService.completePasskeyLogin(7L)).isInstanceOf(BusinessException.class)
                .hasMessageContaining("Use your password");
            verify(auditService, never()).record(any(), anyLong(), anyString());
        }

        @Test
        @DisplayName("un compte désactivé ou inconnu n'ouvre rien")
        void refuses_inactive_or_unknown_accounts() {
            when(userRepository.findById(7L)).thenReturn(java.util.Optional.of(
                User.builder().id(7L).email(TEST_EMAIL).keycloakId(TEST_KEYCLOAK_ID).isActive(false).build()));
            when(userRepository.findById(8L)).thenReturn(java.util.Optional.empty());

            assertThatThrownBy(() -> authService.completePasskeyLogin(7L)).isInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> authService.completePasskeyLogin(8L)).isInstanceOf(BusinessException.class);
            verify(keycloakAuthService, never()).impersonate(anyString());
        }
    }
}
