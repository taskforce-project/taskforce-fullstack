package com.taskforce.tf_api.core.api;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.model.Subscription;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.SubscriptionRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuthService;
import com.taskforce.tf_api.core.service.GdprService;
import com.taskforce.tf_api.core.service.StripeService;
import com.taskforce.tf_api.core.service.WorkspaceInvitationService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web (paiement / RGPD / invitations — priorité critique) via {@code @WebMvcTest}.
 * Contrats HTTP : GDPR export/delete (auth + 401), invitations create/preview, billing portal (Stripe mocké),
 * vérification de session Stripe (endpoint public). Services mockés.
 */
@WebMvcTest({GdprController.class, InvitationController.class, BillingController.class, StripeController.class})
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("Payment/Data controllers (@WebMvcTest)")
class PaymentAndDataControllersWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private GdprService gdprService;
    @MockitoBean private WorkspaceInvitationService invitationService;
    @MockitoBean private StripeService stripeService;
    @MockitoBean private AuthService authService;
    @MockitoBean private SubscriptionRepository subscriptionRepository;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";

    private void stubUser() {
        when(userRepository.findByEmail(EMAIL))
            .thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    // ---- RGPD / données -----------------------------------------------------
    @Test
    @DisplayName("GET /api/gdpr/export (auth) → 200 + données")
    void gdpr_export_200() throws Exception {
        stubUser();
        when(gdprService.exportMyData(anyLong())).thenReturn(Map.of("profile", Map.of("email", EMAIL)));

        mockMvc.perform(get("/api/gdpr/export").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("DELETE /api/gdpr/account (auth) → 200 (anonymisation)")
    void gdpr_delete_200() throws Exception {
        stubUser();

        mockMvc.perform(delete("/api/gdpr/account").with(auth()))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET /api/gdpr/export sans JWT → 401")
    void gdpr_export_unauthenticated_401() throws Exception {
        mockMvc.perform(get("/api/gdpr/export"))
            .andExpect(status().isUnauthorized());
    }

    // ---- Invitations --------------------------------------------------------
    @Test
    @DisplayName("POST /workspaces/{slug}/invitations (auth) → 2xx")
    void invitation_create_2xx() throws Exception {
        stubUser();
        when(invitationService.createInvitation(anyString(), anyLong(), any())).thenReturn(null);

        mockMvc.perform(post("/api/workspaces/acme/invitations").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"bob@it.dev\",\"role\":\"MEMBER\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("GET /invitations/{token} (auth) → 200 (preview)")
    void invitation_preview_200() throws Exception {
        stubUser();
        when(invitationService.preview(anyString())).thenReturn(null);

        mockMvc.perform(get("/api/invitations/some-token").with(auth()))
            .andExpect(status().isOk());
    }

    // ---- Paiement -----------------------------------------------------------
    @Test
    @DisplayName("POST /api/billing/portal (auth) → 200 + URL portail Stripe")
    void billing_portal_200() throws Exception {
        stubUser();
        when(subscriptionRepository.findByUserId(7L))
            .thenReturn(Optional.of(Subscription.builder().userId(7L).stripeCustomerId("cus_123").build()));
        when(stripeService.createBillingPortalSession(anyString(), anyString()))
            .thenReturn("https://billing.stripe.test/session");

        mockMvc.perform(post("/api/billing/portal").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("GET /api/stripe/verify-session (public) → 200")
    void stripe_verify_session_200() throws Exception {
        when(authService.completeRegistrationAfterPayment(anyString())).thenReturn(null);

        mockMvc.perform(get("/api/stripe/verify-session").param("session_id", "cs_test_1"))
            .andExpect(status().isOk());
    }
}
