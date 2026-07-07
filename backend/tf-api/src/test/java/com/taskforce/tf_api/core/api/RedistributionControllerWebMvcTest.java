package com.taskforce.tf_api.core.api;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.dto.response.RedistributionPlanResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.RedistributionService;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web (B-T6) — {@link RedistributionController} via {@code @WebMvcTest} + MockMvc.
 *
 * <p>Valide le contrat HTTP réel : préfixe {@code /api}, enveloppe {@link com.taskforce.tf_api.shared.dto.ApiResponse}
 * en succès, authentification JWT (401 sans jeton), mapping des exceptions métier par le
 * {@code GlobalExceptionHandler} (403 sur {@link ForbiddenException}) et validation {@code @Valid} → 400.
 * La sécurité réelle ({@link SecurityConfig}, resource-server HS512) est chargée ; on injecte un
 * principal via le post-processor {@code jwt()} (le décodeur n'est donc pas invoqué).</p>
 */
@WebMvcTest(RedistributionController.class)
@Import({SecurityConfig.class, JwtIdentityResolver.class})
@ActiveProfiles("test")
@DisplayName("RedistributionController (@WebMvcTest)")
class RedistributionControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private RedistributionService redistributionService;
    @MockitoBean private UserRepository userRepository;
    // Requis par WorkspaceAccessInterceptor (WebMvcConfig) chargé dans la tranche web.
    // Non stubbés : findBySlug renvoie vide → l'intercepteur fait fail-open (laisse passer).
    @MockitoBean private com.taskforce.tf_api.core.repository.WorkspaceRepository workspaceRepository;
    @MockitoBean private com.taskforce.tf_api.core.repository.WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "mgr@it.dev";
    private static final String PREVIEW_URL = "/api/workspaces/acme/redistribute/preview";
    private static final String APPLY_URL = "/api/workspaces/acme/redistribute/apply";

    private void stubUser() {
        when(userRepository.findByEmail(EMAIL))
            .thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
    }

    @Test
    @DisplayName("POST /preview authentifié → 200 + enveloppe ApiResponse (success=true)")
    void preview_authenticated_returns_200_envelope() throws Exception {
        stubUser();
        RedistributionPlanResponse plan = RedistributionPlanResponse.builder()
            .totalMoves(0).moves(List.of()).memberLoads(List.of()).threshold(8).build();
        when(redistributionService.preview(anyString(), anyLong(), any())).thenReturn(plan);

        mockMvc.perform(post(PREVIEW_URL).with(jwt().jwt(b -> b.claim("email", EMAIL))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.threshold").value(8));
    }

    @Test
    @DisplayName("POST /preview sans JWT → 401 (endpoint protégé)")
    void preview_unauthenticated_returns_401() throws Exception {
        mockMvc.perform(post(PREVIEW_URL))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /preview quand le service refuse (ForbiddenException) → 403")
    void preview_forbidden_maps_to_403() throws Exception {
        stubUser();
        when(redistributionService.preview(anyString(), anyLong(), any()))
            .thenThrow(new ForbiddenException("non-manager"));

        mockMvc.perform(post(PREVIEW_URL).with(jwt().jwt(b -> b.claim("email", EMAIL))))
            .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("POST /apply avec corps invalide (moves vide) → 400 (@Valid)")
    void apply_invalid_body_returns_400() throws Exception {
        stubUser();

        mockMvc.perform(post(APPLY_URL)
                .with(jwt().jwt(b -> b.claim("email", EMAIL)))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"moves\":[]}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /apply valide → 200 + enveloppe succès")
    void apply_valid_returns_200() throws Exception {
        stubUser();
        when(redistributionService.apply(anyString(), anyLong(), any()))
            .thenReturn(com.taskforce.tf_api.core.dto.response.ApplyRedistributionResponse.builder()
                .applied(1).skipped(0).build());

        mockMvc.perform(post(APPLY_URL)
                .with(jwt().jwt(b -> b.claim("email", EMAIL)))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"moves\":[{\"issueId\":1,\"toUserId\":2}]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.applied").value(1));
    }
}
