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

import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuthService;
import com.taskforce.tf_api.core.service.TwoFactorService;
import com.taskforce.tf_api.core.service.UserService;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.OAuthLoginService;
import com.taskforce.tf_api.shared.security.RefreshTokenCookie;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tranche web des points d'entrée publics (connexion externe OAuth) et utilisateur. Vérifie le
 * routage et les gardes de bordure : liste blanche des fournisseurs, état anti-CSRF, exigence
 * d'authentification. L'OAuth est dans PUBLIC_MATCHERS (chaîne @Order(1)) → aucun JWT attendu ;
 * /users/** reste authentifié.
 */
@WebMvcTest({OAuthLoginController.class, UserController.class})
@Import({SecurityConfig.class, RefreshTokenCookie.class})
@ActiveProfiles("test")
@DisplayName("Controllers publics + utilisateur (@WebMvcTest)")
class AuthUserControllersWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private OAuthLoginService oauthLoginService;
    @MockitoBean private AuthService authService;
    @MockitoBean private UserService userService;
    @MockitoBean private TwoFactorService twoFactorService;
    @MockitoBean private JwtIdentityResolver identityResolver;
    // Requis pour instancier WorkspaceAccessInterceptor (WebMvcConfig chargé dans la slice), même si
    // aucune route testée ici n'est sous /api/workspaces/** → l'intercepteur ne s'applique pas.
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";

    // ── OAuth (public) ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("GET oauth authorize — fournisseur hors liste blanche → 400")
    void oauth_unsupported_provider_400() throws Exception {
        mockMvc.perform(get("/api/auth/oauth/twitter/authorize").param("redirectUri", "http://localhost:3000/cb"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET oauth authorize — github → 200 + authUrl")
    void oauth_github_authorize_200() throws Exception {
        when(oauthLoginService.buildAuthorizationUrl(eq("github"), anyString())).thenReturn("http://kc/auth?x=1");
        mockMvc.perform(get("/api/auth/oauth/github/authorize").param("redirectUri", "http://localhost:3000/cb"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.authUrl").value("http://kc/auth?x=1"));
    }

    @Test
    @DisplayName("POST oauth callback — état anti-CSRF invalide → 400")
    void oauth_callback_invalid_state_400() throws Exception {
        when(oauthLoginService.isStateValid(any())).thenReturn(false);
        mockMvc.perform(post("/api/auth/oauth/callback")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"c\",\"state\":\"bad\",\"redirectUri\":\"http://localhost:3000/cb\"}"))
            .andExpect(status().isBadRequest());
    }

    // ── User (authentifié) ──────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /users/me → 200")
    void user_me_200() throws Exception {
        when(identityResolver.resolveEmail(any())).thenReturn(EMAIL);
        when(userService.getByEmail(EMAIL)).thenReturn(null);
        mockMvc.perform(get("/api/users/me").with(jwt().jwt(b -> b.claim("email", EMAIL))))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET /users/search → 200")
    void user_search_200() throws Exception {
        when(userService.searchUsers(anyString(), any())).thenReturn(List.of());
        mockMvc.perform(get("/api/users/search").param("q", "al").with(jwt().jwt(b -> b.claim("email", EMAIL))))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET /users/search sans q → 400 qui nomme le paramètre, pas 500")
    void user_search_without_q_400() throws Exception {
        mockMvc.perform(get("/api/users/search").with(jwt().jwt(b -> b.claim("email", EMAIL))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("The request parameter 'q' is required."));
    }

    @Test
    @DisplayName("GET /users/me sans JWT → 401")
    void user_me_unauthenticated_401() throws Exception {
        mockMvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
    }
}
