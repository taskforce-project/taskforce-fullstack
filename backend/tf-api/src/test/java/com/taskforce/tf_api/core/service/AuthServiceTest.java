package com.taskforce.tf_api.core.service;

import com.stripe.exception.StripeException;
import com.stripe.model.Customer;
import com.taskforce.tf_api.core.dto.request.LoginRequest;
import com.taskforce.tf_api.core.dto.request.RegisterRequest;
import com.taskforce.tf_api.core.dto.request.SelectPlanRequest;
import com.taskforce.tf_api.core.dto.request.VerifyOtpRequest;
import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.RegisterResponse;
import com.taskforce.tf_api.core.dto.response.SelectPlanResponse;
import com.taskforce.tf_api.core.dto.response.VerifyOtpResponse;
import com.taskforce.tf_api.core.dto.response.VerifySessionResponse;
import com.taskforce.tf_api.core.enums.OtpType;
import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.OtpVerification;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.util.TestDataBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.keycloak.representations.idm.UserRepresentation;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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
    private StripeService stripeService;

    @Mock
    private EmailService emailService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private JwtService jwtService;

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
            registerRequest = TestDataBuilder.buildRegisterRequest(TEST_EMAIL, PlanType.FREE);
        }

        @Test
        @DisplayName("devrait créer un nouvel utilisateur et envoyer OTP")
        void register_shouldCreateUserAndSendOtp_whenNewUser() {
            // Given
            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.createUser(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(TEST_KEYCLOAK_ID);
            when(otpService.generateAndSendOtp(anyString(), anyString(), any(), any(), anyString(), any()))
                .thenReturn(TestDataBuilder.buildOtp());

            // When
            RegisterResponse response = authService.register(registerRequest);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.isOtpSent()).isTrue();
            assertThat(response.getEmail()).isEqualTo(TEST_EMAIL);
            assertThat(response.getMessage()).contains("code de vérification");

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
                eq(TEST_KEYCLOAK_ID),
                eq(PlanType.FREE)
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
            when(otpService.generateAndSendOtp(anyString(), anyString(), any(), any(), anyString(), any()))
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
                eq(TEST_KEYCLOAK_ID),
                eq(PlanType.FREE)
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
                .hasMessageContaining("déjà vérifié");

            verify(otpService, never()).generateAndSendOtp(anyString(), anyString(), any(), any(), anyString(), any());
        }

        @Test
        @DisplayName("devrait lancer exception si email existe déjà en DB")
        void register_shouldThrowException_whenEmailExistsInDb() {
            // Given
            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(true);

            // When/Then
            assertThatThrownBy(() -> authService.register(registerRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("déjà utilisé");

            verify(keycloakService, never()).createUser(anyString(), anyString(), anyString(), anyString());
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
            when(otpService.generateAndSendOtp(anyString(), anyString(), any(), any(), anyString(), any()))
                .thenReturn(TestDataBuilder.buildOtp());

            // When
            RegisterResponse response = authService.register(registerRequest);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.isOtpSent()).isTrue();

            verify(keycloakService).getUserByEmail(TEST_EMAIL);
            verify(otpService).generateAndSendOtp(anyString(), anyString(), any(), any(), anyString(), any());
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
                .hasMessageContaining("déjà vérifié");
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
    @DisplayName("SelectPlan Tests")
    class SelectPlanTests {

        private SelectPlanRequest selectPlanRequest;

        @BeforeEach
        void setUp() {
            selectPlanRequest = TestDataBuilder.buildSelectPlanRequest(TEST_EMAIL, "PRO");
        }

        @Test
        @DisplayName("devrait enregistrer le plan sélectionné avec succès")
        void selectPlan_shouldStorePlan_whenValidRequest() {
            // Given
            UserRepresentation keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", false);
            keycloakUser.setId(TEST_KEYCLOAK_ID);

            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(otpService.updatePlanType(TEST_EMAIL, TEST_KEYCLOAK_ID, "PRO")).thenReturn(true);

            // When
            SelectPlanResponse response = authService.selectPlan(selectPlanRequest);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.getEmail()).isEqualTo(TEST_EMAIL);
            assertThat(response.getPlanType()).isEqualTo("PRO");
            assertThat(response.isOtpSent()).isTrue();
            assertThat(response.getMessage()).contains("Plan sélectionné");

            verify(otpService).updatePlanType(TEST_EMAIL, TEST_KEYCLOAK_ID, "PRO");
        }

        @Test
        @DisplayName("devrait lancer exception si utilisateur non trouvé")
        void selectPlan_shouldThrowException_whenUserNotFound() {
            // Given
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(null);

            // When/Then
            assertThatThrownBy(() -> authService.selectPlan(selectPlanRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("non trouvé");

            verify(otpService, never()).updatePlanType(anyString(), anyString(), anyString());
        }

        @Test
        @DisplayName("devrait lancer exception si email déjà vérifié")
        void selectPlan_shouldThrowException_whenEmailAlreadyVerified() {
            // Given
            UserRepresentation keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", true);

            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);

            // When/Then
            assertThatThrownBy(() -> authService.selectPlan(selectPlanRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("déjà vérifié");

            verify(otpService, never()).updatePlanType(anyString(), anyString(), anyString());
        }

        @Test
        @DisplayName("devrait lancer exception si OTP non trouvé")
        void selectPlan_shouldThrowException_whenOtpNotFound() {
            // Given
            UserRepresentation keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", false);
            keycloakUser.setId(TEST_KEYCLOAK_ID);

            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(otpService.updatePlanType(TEST_EMAIL, TEST_KEYCLOAK_ID, "PRO")).thenReturn(false);

            // When/Then
            assertThatThrownBy(() -> authService.selectPlan(selectPlanRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Code OTP introuvable");
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
            otpVerification.setPlanType(PlanType.FREE.toString());
        }

        @Test
        @DisplayName("devrait créer utilisateur avec plan FREE et générer tokens")
        void verifyOtp_shouldCreateUserWithFreePlan_whenOtpValid() {
            // Given
            when(otpService.verifyOtpAndGetDetails(TEST_EMAIL, TEST_OTP_CODE)).thenReturn(otpVerification);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            doNothing().when(keycloakService).verifyEmail(TEST_KEYCLOAK_ID);
            when(userRepository.save(any(User.class))).thenAnswer(i -> {
                User user = i.getArgument(0);
                user.setId(1L);
                return user;
            });
            doNothing().when(emailService).sendWelcomeEmail(anyString(), anyString());
            when(jwtService.generateTokens(any(User.class), any(UserRepresentation.class)))
                .thenReturn(AuthResponse.builder().accessToken("access").refreshToken("refresh").build());

            // When
            VerifyOtpResponse response = authService.verifyOtpAndCompleteRegistration(verifyRequest);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.getVerified()).isTrue();
            assertThat(response.getCheckoutSessionUrl()).isNull(); // FREE = pas de checkout
            assertThat(response.getAuthData()).isNotNull();

            verify(keycloakService).verifyEmail(TEST_KEYCLOAK_ID);
            verify(userRepository).save(userCaptor.capture());
            verify(emailService).sendWelcomeEmail(TEST_EMAIL, "Test");

            User savedUser = userCaptor.getValue();
            assertThat(savedUser.getPlanType()).isEqualTo(PlanType.FREE);
            assertThat(savedUser.getPlanStatus()).isNull(); // FREE n'a pas de status
            assertThat(savedUser.getEmail()).isEqualTo(TEST_EMAIL);
        }

        @Test
        @DisplayName("devrait retourner URL checkout pour plan PRO")
        void verifyOtp_shouldReturnCheckoutUrl_whenProPlan() throws StripeException {
            // Given
            otpVerification.setPlanType(PlanType.PRO.toString());

            Customer stripeCustomer = new Customer();
            stripeCustomer.setId("cus_123");

            com.stripe.model.checkout.Session checkoutSession = new com.stripe.model.checkout.Session();
            checkoutSession.setUrl("https://checkout.stripe.com/session123");

            when(otpService.verifyOtpAndGetDetails(TEST_EMAIL, TEST_OTP_CODE)).thenReturn(otpVerification);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            doNothing().when(keycloakService).verifyEmail(TEST_KEYCLOAK_ID);
            when(stripeService.createCustomer(anyString(), anyString())).thenReturn(stripeCustomer);
            when(stripeService.getPriceIdForPlan("PRO")).thenReturn("price_pro");
            when(stripeService.createCheckoutSession(any(), any(), any(), any(), any()))
                .thenReturn(checkoutSession);
            when(userRepository.save(any(User.class))).thenAnswer(i -> {
                User user = i.getArgument(0);
                user.setId(1L);
                return user;
            });
            doNothing().when(emailService).sendWelcomeEmail(anyString(), anyString());
            when(jwtService.generateTokens(any(User.class), any(UserRepresentation.class)))
                .thenReturn(AuthResponse.builder().accessToken("access").refreshToken("refresh").build());

            // When
            VerifyOtpResponse response = authService.verifyOtpAndCompleteRegistration(verifyRequest);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.getVerified()).isTrue();
            assertThat(response.getCheckoutSessionUrl()).isEqualTo("https://checkout.stripe.com/session123");

            verify(stripeService).createCustomer(TEST_EMAIL, "Test User");
            verify(userRepository).save(userCaptor.capture());

            User savedUser = userCaptor.getValue();
            assertThat(savedUser.getPlanType()).isEqualTo(PlanType.PRO);
            assertThat(savedUser.getPlanStatus()).isEqualTo(PlanStatus.TRIALING);
            assertThat(savedUser.getStripeCustomerId()).isEqualTo("cus_123");
        }

        @Test
        @DisplayName("devrait retourner URL checkout pour plan ENTERPRISE")
        void verifyOtp_shouldReturnCheckoutUrl_whenEnterprisePlan() throws StripeException {
            // Given
            otpVerification.setPlanType(PlanType.ENTERPRISE.toString());

            Customer stripeCustomer = new Customer();
            stripeCustomer.setId("cus_456");

            com.stripe.model.checkout.Session checkoutSession = new com.stripe.model.checkout.Session();
            checkoutSession.setUrl("https://checkout.stripe.com/business");

            when(otpService.verifyOtpAndGetDetails(TEST_EMAIL, TEST_OTP_CODE)).thenReturn(otpVerification);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            doNothing().when(keycloakService).verifyEmail(TEST_KEYCLOAK_ID);
            when(stripeService.createCustomer(anyString(), anyString())).thenReturn(stripeCustomer);
            when(stripeService.getPriceIdForPlan("ENTERPRISE")).thenReturn("price_enterprise");
            when(stripeService.createCheckoutSession(any(), any(), any(), any(), any()))
                .thenReturn(checkoutSession);
            when(userRepository.save(any(User.class))).thenAnswer(i -> {
                User user = i.getArgument(0);
                user.setId(1L);
                return user;
            });
            doNothing().when(emailService).sendWelcomeEmail(anyString(), anyString());
            when(jwtService.generateTokens(any(User.class), any(UserRepresentation.class)))
                .thenReturn(AuthResponse.builder().accessToken("access").refreshToken("refresh").build());

            // When
            VerifyOtpResponse response = authService.verifyOtpAndCompleteRegistration(verifyRequest);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.getCheckoutSessionUrl()).isNotNull();

            verify(userRepository).save(userCaptor.capture());
            assertThat(userCaptor.getValue().getPlanType()).isEqualTo(PlanType.ENTERPRISE);
        }

        @Test
        @DisplayName("devrait lancer exception si OTP invalide")
        void verifyOtp_shouldThrowException_whenOtpInvalid() {
            // Given
            when(otpService.verifyOtpAndGetDetails(TEST_EMAIL, TEST_OTP_CODE)).thenReturn(null);

            // When/Then
            assertThatThrownBy(() -> authService.verifyOtpAndCompleteRegistration(verifyRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("invalide ou expiré");

            verify(userRepository, never()).save(any(User.class));
        }

        @Test
        @DisplayName("devrait lancer exception si plan non sélectionné")
        void verifyOtp_shouldThrowException_whenPlanNotSelected() {
            // Given
            otpVerification.setPlanType(null);
            when(otpService.verifyOtpAndGetDetails(TEST_EMAIL, TEST_OTP_CODE)).thenReturn(otpVerification);

            // When/Then
            assertThatThrownBy(() -> authService.verifyOtpAndCompleteRegistration(verifyRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Plan non sélectionné");

            verify(userRepository, never()).save(any(User.class));
        }

        @Test
        @DisplayName("devrait lancer exception si erreur Stripe")
        void verifyOtp_shouldThrowException_whenStripeError() throws StripeException {
            // Given
            otpVerification.setPlanType(PlanType.PRO.toString());

            when(otpService.verifyOtpAndGetDetails(TEST_EMAIL, TEST_OTP_CODE)).thenReturn(otpVerification);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(stripeService.createCustomer(anyString(), anyString()))
                .thenThrow(new StripeException("Payment error", null, null, 500) {});

            // When/Then
            assertThatThrownBy(() -> authService.verifyOtpAndCompleteRegistration(verifyRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("paiement");
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
            user = TestDataBuilder.buildUser(TEST_EMAIL, PlanType.FREE);
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
            when(jwtService.generateTokens(user, keycloakUser))
                .thenReturn(AuthResponse.builder().accessToken("access").refreshToken("refresh").build());

            // When
            AuthResponse response = authService.login(loginRequest);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.getAccessToken()).isEqualTo("access");
            assertThat(response.getRefreshToken()).isEqualTo("refresh");

            verify(keycloakAuthService).authenticate(TEST_EMAIL, "Password123!");
            verify(jwtService).generateTokens(user, keycloakUser);
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
                .hasMessageContaining("vérifier votre email");

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
                .hasMessageContaining("désactivé");

            verify(jwtService, never()).generateTokens(any(), any());
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
            when(jwtService.generateTokens(any(User.class), eq(keycloakUser)))
                .thenReturn(AuthResponse.builder().accessToken("access").refreshToken("refresh").build());

            // When
            AuthResponse response = authService.login(loginRequest);

            // Then
            assertThat(response).isNotNull();

            verify(userRepository).save(userCaptor.capture());
            User createdUser = userCaptor.getValue();
            assertThat(createdUser.getEmail()).isEqualTo(TEST_EMAIL);
            assertThat(createdUser.getPlanType()).isEqualTo(PlanType.FREE);
            assertThat(createdUser.getIsActive()).isTrue();
        }

        @Test
        @DisplayName("devrait lancer exception si credentials invalides")
        void login_shouldThrowException_whenInvalidCredentials() {
            // Given
            doThrow(new RuntimeException("Email ou mot de passe incorrect"))
                .when(keycloakAuthService).authenticate(TEST_EMAIL, "WrongPassword");

            loginRequest = TestDataBuilder.buildLoginRequest(TEST_EMAIL, "WrongPassword");

            // When/Then
            assertThatThrownBy(() -> authService.login(loginRequest))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Email ou mot de passe incorrect");

            verify(userRepository, never()).findByKeycloakId(anyString());
        }
    }

    @Nested
    @DisplayName("ResendOtp Tests")
    class ResendOtpTests {

        private UserRepresentation keycloakUser;
        private OtpVerification existingOtp;

        @BeforeEach
        void setUp() {
            keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", false);
            keycloakUser.setId(TEST_KEYCLOAK_ID);
            existingOtp = TestDataBuilder.buildOtp(TEST_EMAIL, "999999", OtpType.EMAIL_VERIFICATION);
            existingOtp.setPlanType(PlanType.PRO.toString());
        }

        @Test
        @DisplayName("devrait renvoyer OTP avec le plan précédemment sélectionné")
        void resendOtp_shouldSendNewOtp_withPreviousPlan() {
            // Given
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(otpService.getLatestOtp(TEST_EMAIL)).thenReturn(existingOtp);
            when(otpService.generateAndSendOtp(anyString(), anyString(), any(), any(), anyString(), any()))
                .thenReturn(TestDataBuilder.buildOtp());

            // When
            RegisterResponse response = authService.resendOtp(TEST_EMAIL);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.isOtpSent()).isTrue();
            assertThat(response.getMessage()).contains("nouveau code");

            verify(otpService).generateAndSendOtp(
                eq(TEST_EMAIL),
                eq("Test"),
                eq(OtpType.EMAIL_VERIFICATION),
                isNull(),
                eq(TEST_KEYCLOAK_ID),
                eq(PlanType.PRO)
            );
        }

        @Test
        @DisplayName("devrait renvoyer OTP sans plan si aucun OTP précédent")
        void resendOtp_shouldSendOtpWithoutPlan_whenNoPreviousOtp() {
            // Given
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(otpService.getLatestOtp(TEST_EMAIL)).thenReturn(null);
            when(otpService.generateAndSendOtp(anyString(), anyString(), any(), any(), anyString(), any()))
                .thenReturn(TestDataBuilder.buildOtp());

            // When
            RegisterResponse response = authService.resendOtp(TEST_EMAIL);

            // Then
            assertThat(response).isNotNull();

            verify(otpService).generateAndSendOtp(
                eq(TEST_EMAIL),
                eq("Test"),
                eq(OtpType.EMAIL_VERIFICATION),
                isNull(),
                eq(TEST_KEYCLOAK_ID),
                isNull()
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
                .hasMessageContaining("déjà vérifié");

            verify(otpService, never()).generateAndSendOtp(anyString(), anyString(), any(), any(), anyString(), any());
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
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(true);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            when(otpService.generateAndSendOtp(anyString(), anyString(), any(), any(), anyString(), any()))
                .thenReturn(TestDataBuilder.buildOtp());

            // When
            authService.forgotPassword(TEST_EMAIL);

            // Then
            verify(otpService).generateAndSendOtp(
                eq(TEST_EMAIL),
                eq("Test"),
                eq(OtpType.PASSWORD_RESET),
                isNull(),
                eq(TEST_KEYCLOAK_ID),
                isNull()
            );
        }

        @Test
        @DisplayName("devrait lancer exception si utilisateur non trouvé")
        void forgotPassword_shouldThrowException_whenUserNotFound() {
            // Given
            when(keycloakService.emailExists(TEST_EMAIL)).thenReturn(false);

            // When/Then
            assertThatThrownBy(() -> authService.forgotPassword(TEST_EMAIL))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Aucun compte");

            verify(otpService, never()).generateAndSendOtp(anyString(), anyString(), any(), any(), anyString(), any());
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
                .hasMessageContaining("invalide ou expiré");

            verify(keycloakService, never()).updatePassword(anyString(), anyString());
        }
    }

    @Nested
    @DisplayName("CompleteAfterPayment Tests")
    class CompleteAfterPaymentTests {

        private com.stripe.model.checkout.Session stripeSession;
        private com.stripe.model.Customer stripeCustomer;
        private OtpVerification otpVerification;
        private UserRepresentation keycloakUser;

        @BeforeEach
        void setUp() {
            stripeSession = new com.stripe.model.checkout.Session();
            stripeSession.setPaymentStatus("paid");
            stripeSession.setCustomer("cus_123");
            stripeSession.setSubscription("sub_123");

            stripeCustomer = new com.stripe.model.Customer();
            stripeCustomer.setEmail(TEST_EMAIL);

            otpVerification = TestDataBuilder.buildOtp(TEST_EMAIL, TEST_OTP_CODE, OtpType.EMAIL_VERIFICATION);
            otpVerification.setKeycloakId(TEST_KEYCLOAK_ID);
            otpVerification.setPlanType(PlanType.PRO.toString());

            keycloakUser = TestDataBuilder.buildKeycloakUser(TEST_EMAIL, "Test", "User", false);
            keycloakUser.setId(TEST_KEYCLOAK_ID);
        }

        @Test
        @DisplayName("devrait créer utilisateur avec plan ACTIVE après paiement")
        void completeAfterPayment_shouldCreateUser_whenSessionValid() throws StripeException {
            // Given
            when(stripeService.getCheckoutSession("session_123")).thenReturn(stripeSession);
            when(stripeService.retrieveCustomer("cus_123")).thenReturn(stripeCustomer);
            when(otpService.getLatestOtp(TEST_EMAIL)).thenReturn(otpVerification);
            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(false);
            when(keycloakService.getUserByEmail(TEST_EMAIL)).thenReturn(keycloakUser);
            doNothing().when(keycloakService).verifyEmail(TEST_KEYCLOAK_ID);
            when(userRepository.save(any(User.class))).thenAnswer(i -> {
                User user = i.getArgument(0);
                user.setId(1L);
                return user;
            });
            doNothing().when(emailService).sendWelcomeEmail(anyString(), anyString());

            // When
            VerifySessionResponse response = authService.completeRegistrationAfterPayment("session_123");

            // Then
            assertThat(response).isNotNull();
            assertThat(response.getEmail()).isEqualTo(TEST_EMAIL);
            assertThat(response.getPlanType()).isEqualTo("PRO");
            assertThat(response.isUserCreated()).isTrue();
            assertThat(response.getSubscriptionId()).isEqualTo("sub_123");

            verify(keycloakService).verifyEmail(TEST_KEYCLOAK_ID);
            verify(userRepository).save(userCaptor.capture());
            verify(emailService).sendWelcomeEmail(TEST_EMAIL, "Test");

            User savedUser = userCaptor.getValue();
            assertThat(savedUser.getPlanType()).isEqualTo(PlanType.PRO);
            assertThat(savedUser.getPlanStatus()).isEqualTo(PlanStatus.ACTIVE);
            assertThat(savedUser.getStripeCustomerId()).isEqualTo("cus_123");
            assertThat(savedUser.getStripeSubscriptionId()).isEqualTo("sub_123");
        }

        @Test
        @DisplayName("devrait mettre à jour utilisateur existant avec infos paiement")
        void completeAfterPayment_shouldUpdateUser_whenAlreadyExists() throws StripeException {
            // Given
            User existingUser = TestDataBuilder.buildUser(TEST_EMAIL, PlanType.PRO);
            existingUser.setPlanStatus(PlanStatus.TRIALING);

            when(stripeService.getCheckoutSession("session_123")).thenReturn(stripeSession);
            when(stripeService.retrieveCustomer("cus_123")).thenReturn(stripeCustomer);
            when(otpService.getLatestOtp(TEST_EMAIL)).thenReturn(otpVerification);
            when(userRepository.existsByEmail(TEST_EMAIL)).thenReturn(true);
            when(userRepository.findByEmail(TEST_EMAIL)).thenReturn(Optional.of(existingUser));
            when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));

            // When
            VerifySessionResponse response = authService.completeRegistrationAfterPayment("session_123");

            // Then
            assertThat(response).isNotNull();
            assertThat(response.isUserCreated()).isFalse();
            assertThat(response.getMessage()).contains("abonnement est maintenant actif");

            verify(userRepository).save(userCaptor.capture());
            User updatedUser = userCaptor.getValue();
            assertThat(updatedUser.getPlanStatus()).isEqualTo(PlanStatus.ACTIVE);
            assertThat(updatedUser.getStripeCustomerId()).isEqualTo("cus_123");
            assertThat(updatedUser.getStripeSubscriptionId()).isEqualTo("sub_123");
        }

        @Test
        @DisplayName("devrait lancer exception si paiement non validé")
        void completeAfterPayment_shouldThrowException_whenPaymentNotPaid() throws StripeException {
            // Given
            stripeSession.setPaymentStatus("unpaid");
            when(stripeService.getCheckoutSession("session_123")).thenReturn(stripeSession);

            // When/Then
            assertThatThrownBy(() -> authService.completeRegistrationAfterPayment("session_123"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("paiement n'est pas encore validé");

            verify(userRepository, never()).save(any(User.class));
        }

        @Test
        @DisplayName("devrait lancer exception si données d'inscription incomplètes")
        void completeAfterPayment_shouldThrowException_whenIncompleteData() throws StripeException {
            // Given
            otpVerification.setKeycloakId(null); // Données incomplètes

            when(stripeService.getCheckoutSession("session_123")).thenReturn(stripeSession);
            when(stripeService.retrieveCustomer("cus_123")).thenReturn(stripeCustomer);
            when(otpService.getLatestOtp(TEST_EMAIL)).thenReturn(otpVerification);

            // When/Then
            assertThatThrownBy(() -> authService.completeRegistrationAfterPayment("session_123"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Données d'inscription incomplètes");

            verify(userRepository, never()).save(any(User.class));
        }

        @Test
        @DisplayName("devrait lancer exception si aucune inscription en attente")
        void completeAfterPayment_shouldThrowException_whenNoOtpFound() throws StripeException {
            // Given
            when(stripeService.getCheckoutSession("session_123")).thenReturn(stripeSession);
            when(stripeService.retrieveCustomer("cus_123")).thenReturn(stripeCustomer);
            when(otpService.getLatestOtp(TEST_EMAIL)).thenReturn(null);

            // When/Then
            assertThatThrownBy(() -> authService.completeRegistrationAfterPayment("session_123"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Aucune inscription en attente");

            verify(userRepository, never()).save(any(User.class));
        }
    }
}
