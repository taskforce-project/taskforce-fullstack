package com.taskforce.tf_api.core.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.config.CorsConfig;
import com.taskforce.tf_api.shared.config.RateLimitConfig;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Sécurité - un refus du limiteur de débit reste lisible par le navigateur (PC-053).
 *
 * <p>Le 429 du {@code RateLimitFilter} est écrit avant Spring Security. Tant que le CORS ne passait que
 * dans les chaînes de sécurité, ce 429 partait sans {@code Access-Control-Allow-Origin} : le navigateur
 * le bloquait, et l'app affichait « Couldn't reach the server » au lieu de « trop de requêtes ». Le test
 * charge les vrais enregistrements de filtres ({@link CorsConfig}, {@link RateLimitConfig}) ; MockMvc
 * les applique dans l'ordre du conteneur de servlets. Une IP par cas (en-tête {@code X-Real-IP}) : le
 * contexte, donc le compteur, est partagé entre les tests.</p>
 */
@WebMvcTest(ClientLogController.class)
@Import({SecurityConfig.class, JwtIdentityResolver.class, CorsConfig.class, RateLimitConfig.class})
@ActiveProfiles("test")
@DisplayName("Sécurité - 429 du limiteur lisible en cross-origin (PC-053)")
class RateLimitCorsWebMvcTest {

    private static final String ALLOWED_ORIGIN = "http://localhost:3000";

    @Autowired private MockMvc mockMvc;

    // Requis par WorkspaceAccessInterceptor (WebMvcConfig) chargé dans la tranche web.
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;
    @MockitoBean private UserRepository userRepository;

    @ParameterizedTest(name = "{0} : après {1} requêtes, le 429 porte les en-têtes CORS et Retry-After")
    @CsvSource({
        // Route publique (chaîne publique), quota AUTH_STRICT.
        "/api/auth/verify-otp,          10,  203.0.113.10",
        // Route protégée, quota DEFAULT : le cas observé (rafale du dashboard).
        "/api/workspaces/acme/projects, 200, 203.0.113.11",
    })
    void rate_limited_response_carries_cors_headers(String path, int quota, String clientIp) throws Exception {
        for (int i = 0; i < quota; i++) {
            mockMvc.perform(get(path).header("Origin", ALLOWED_ORIGIN).header("X-Real-IP", clientIp));
        }

        mockMvc.perform(get(path).header("Origin", ALLOWED_ORIGIN).header("X-Real-IP", clientIp))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN))
            .andExpect(header().string("Access-Control-Allow-Credentials", "true"))
            .andExpect(header().exists("Retry-After"))
            // Sans exposition, le JS ne lit pas Retry-After en cross-origin et ne sait pas combien attendre.
            .andExpect(header().string("Access-Control-Expose-Headers", containsString("Retry-After")));
    }

    @Test
    @DisplayName("une origine hors liste n'obtient toujours pas Access-Control-Allow-Origin")
    void unknown_origin_is_still_refused() throws Exception {
        mockMvc.perform(get("/api/workspaces/acme/projects")
                .header("Origin", "https://evil.example")
                .header("X-Real-IP", "203.0.113.12"))
            .andExpect(status().isForbidden())
            .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    @DisplayName("le préflight d'une route protégée est accepté sans jeton")
    void preflight_on_protected_route_is_answered() throws Exception {
        mockMvc.perform(options("/api/workspaces/acme/projects")
                .header("Origin", ALLOWED_ORIGIN)
                .header("Access-Control-Request-Method", "GET")
                .header("Access-Control-Request-Headers", "Authorization")
                .header("X-Real-IP", "203.0.113.13"))
            .andExpect(status().isOk())
            .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN));
    }
}
