package com.taskforce.tf_api.core.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.RedistributionService;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Sécurité — en-têtes HTTP durcis (OWASP A05 : Security Misconfiguration).
 *
 * <p>Vérifie que la vraie {@link SecurityConfig} pose bien, sur les réponses API, les en-têtes de
 * défense en profondeur : anti-MIME-sniffing, anti-clickjacking, CSP verrouillée pour une API REST,
 * HSTS, Referrer-Policy et Permissions-Policy. Ces en-têtes doivent être présents même sans
 * authentification (ils sont écrits tôt dans la chaîne de filtres).</p>
 */
@WebMvcTest(RedistributionController.class)
@Import({SecurityConfig.class, JwtIdentityResolver.class})
@ActiveProfiles("test")
@DisplayName("Sécurité — en-têtes HTTP (OWASP A05)")
class SecurityHeadersWebMvcTest {

    private static final String URL = "/api/workspaces/acme/redistribute/preview";
    private static final String EXPECTED_CSP = "default-src 'none'; frame-ancestors 'none'; form-action 'none'";

    @Autowired private MockMvc mockMvc;

    @MockitoBean private RedistributionService redistributionService;
    @MockitoBean private UserRepository userRepository;
    // Requis par WorkspaceAccessInterceptor (WebMvcConfig) chargé dans la tranche web.
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    @Test
    @DisplayName("expose tous les en-têtes de sécurité durcis (requête HTTPS authentifiée)")
    void should_expose_all_hardened_headers() throws Exception {
        mockMvc.perform(post(URL).secure(true) // .secure(true) → HSTS n'est écrit que sur HTTPS
                .with(jwt().jwt(b -> b.claim("email", "mgr@it.dev"))))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(header().string("X-Frame-Options", "DENY"))
            .andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"))
            .andExpect(header().string("Content-Security-Policy", EXPECTED_CSP))
            .andExpect(header().string("Strict-Transport-Security", containsString("max-age=31536000")))
            .andExpect(header().string("Strict-Transport-Security", containsString("includeSubDomains")))
            .andExpect(header().string("Permissions-Policy", containsString("payment=()")));
    }

    @Test
    @DisplayName("expose les en-têtes anti-sniffing / anti-clickjacking / CSP même sans authentification (401)")
    void should_expose_headers_even_when_unauthenticated() throws Exception {
        mockMvc.perform(post(URL))
            .andExpect(status().isUnauthorized())
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(header().string("X-Frame-Options", "DENY"))
            .andExpect(header().string("Content-Security-Policy", EXPECTED_CSP));
    }
}
