package com.taskforce.tf_api.core.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuthService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web (connexion, priorité critique) — {@link AuthController} via {@code @WebMvcTest}.
 * Endpoints publics ({@code /api/auth/**}) : login/register/verify-otp/refresh-token + validation {@code @Valid}.
 * {@code AuthService} mocké ; on vérifie le contrat HTTP (enveloppe {@code ApiResponse}, 200/2xx/400).
 */
@WebMvcTest(AuthController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("AuthController (@WebMvcTest)")
class AuthControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private AuthService authService;
    @MockitoBean private UserRepository userRepository;             // WorkspaceAccessInterceptor
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private AuthResponse tokens() {
        return AuthResponse.builder().accessToken("a").refreshToken("r").tokenType("Bearer").build();
    }

    @Test
    @DisplayName("POST /api/auth/login valide → 200 + tokens")
    void login_200() throws Exception {
        when(authService.login(any())).thenReturn(tokens());

        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"password\":\"secret\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accessToken").value("a"));
    }

    @Test
    @DisplayName("POST /api/auth/login corps invalide (@Valid) → 400")
    void login_invalid_400() throws Exception {
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/auth/register valide → 2xx")
    void register_2xx() throws Exception {
        when(authService.register(any())).thenReturn(null);

        mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"password\":\"password1\",\"firstName\":\"John\",\"lastName\":\"Doe\",\"planType\":\"FREE\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /api/auth/register mot de passe trop court (@Size) → 400")
    void register_short_password_400() throws Exception {
        mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"password\":\"short\",\"firstName\":\"John\",\"lastName\":\"Doe\",\"planType\":\"FREE\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/auth/verify-otp valide → 2xx")
    void verify_otp_2xx() throws Exception {
        when(authService.verifyOtpAndCompleteRegistration(any())).thenReturn(null);

        mockMvc.perform(post("/api/auth/verify-otp").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"otpCode\":\"123456\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /api/auth/refresh-token valide → 200 + nouveaux tokens")
    void refresh_token_200() throws Exception {
        when(authService.refreshToken(anyString())).thenReturn(tokens());

        mockMvc.perform(post("/api/auth/refresh-token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"rt\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.refreshToken").value("r"));
    }

    @Test
    @DisplayName("POST /api/auth/select-plan valide → 2xx")
    void select_plan_2xx() throws Exception {
        when(authService.selectPlan(any())).thenReturn(null);

        mockMvc.perform(post("/api/auth/select-plan").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"planType\":\"PRO\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /api/auth/resend-otp valide → 2xx")
    void resend_otp_2xx() throws Exception {
        when(authService.resendOtp(anyString())).thenReturn(null);

        mockMvc.perform(post("/api/auth/resend-otp").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /api/auth/forgot-password → 2xx")
    void forgot_password_2xx() throws Exception {
        mockMvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /api/auth/reset-password valide → 2xx")
    void reset_password_2xx() throws Exception {
        mockMvc.perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"otpCode\":\"123456\",\"newPassword\":\"password1\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /api/auth/logout (header Bearer) → 2xx")
    void logout_2xx() throws Exception {
        mockMvc.perform(post("/api/auth/logout").header("Authorization", "Bearer tok"))
            .andExpect(status().is2xxSuccessful());
    }

    // ------------------------------------------------------------------
    // Branches d'erreur (service qui lève) + validations 400 manquantes
    // ------------------------------------------------------------------

    @Test
    @DisplayName("POST /api/auth/login identifiants invalides (service lève) → 401")
    void login_bad_credentials_401() throws Exception {
        when(authService.login(any())).thenThrow(new RuntimeException("Identifiants invalides"));

        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"password\":\"secret\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    @DisplayName("POST /api/auth/register email invalide (@Email) → 400")
    void register_invalid_email_400() throws Exception {
        mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"not-an-email\",\"password\":\"password1\",\"firstName\":\"John\",\"lastName\":\"Doe\",\"planType\":\"FREE\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/auth/register service lève → 400 + success=false")
    void register_service_error_400() throws Exception {
        when(authService.register(any())).thenThrow(new RuntimeException("Email déjà utilisé"));

        mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"password\":\"password1\",\"firstName\":\"John\",\"lastName\":\"Doe\",\"planType\":\"FREE\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    @DisplayName("POST /api/auth/select-plan plan invalide (@Pattern) → 400")
    void select_plan_invalid_400() throws Exception {
        mockMvc.perform(post("/api/auth/select-plan").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"planType\":\"GOLD\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/auth/select-plan service lève → 400")
    void select_plan_service_error_400() throws Exception {
        when(authService.selectPlan(any())).thenThrow(new RuntimeException("Plan indisponible"));

        mockMvc.perform(post("/api/auth/select-plan").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"planType\":\"PRO\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    @DisplayName("POST /api/auth/verify-otp code non numérique (@Pattern) → 400")
    void verify_otp_invalid_400() throws Exception {
        mockMvc.perform(post("/api/auth/verify-otp").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"otpCode\":\"ABCDEF\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/auth/verify-otp service lève → 400")
    void verify_otp_service_error_400() throws Exception {
        when(authService.verifyOtpAndCompleteRegistration(any())).thenThrow(new RuntimeException("OTP expiré"));

        mockMvc.perform(post("/api/auth/verify-otp").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"otpCode\":\"123456\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    @DisplayName("POST /api/auth/resend-otp email invalide (@Email) → 400")
    void resend_otp_invalid_400() throws Exception {
        mockMvc.perform(post("/api/auth/resend-otp").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"not-an-email\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/auth/resend-otp service lève → 400")
    void resend_otp_service_error_400() throws Exception {
        when(authService.resendOtp(anyString())).thenThrow(new RuntimeException("Compte introuvable"));

        mockMvc.perform(post("/api/auth/resend-otp").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    @DisplayName("POST /api/auth/forgot-password email invalide (@Email) → 400")
    void forgot_password_invalid_400() throws Exception {
        mockMvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"not-an-email\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/auth/reset-password nouveau mot de passe trop court (@Size) → 400")
    void reset_password_short_400() throws Exception {
        mockMvc.perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.dev\",\"otpCode\":\"123456\",\"newPassword\":\"short\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/auth/refresh-token corps vide (@NotBlank) → 400")
    void refresh_token_invalid_400() throws Exception {
        mockMvc.perform(post("/api/auth/refresh-token").contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/auth/refresh-token token expiré (service lève) → 401")
    void refresh_token_expired_401() throws Exception {
        when(authService.refreshToken(anyString())).thenThrow(new RuntimeException("Token expiré"));

        mockMvc.perform(post("/api/auth/refresh-token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"rt\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false));
    }
}
