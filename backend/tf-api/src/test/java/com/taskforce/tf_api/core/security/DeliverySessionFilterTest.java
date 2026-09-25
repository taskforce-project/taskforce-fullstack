package com.taskforce.tf_api.core.security;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import com.taskforce.tf_api.core.service.delivery.DeliverySession;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerService;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerSettings;
import com.taskforce.tf_api.core.service.delivery.RunnerIdentity;
import com.taskforce.tf_api.core.service.delivery.RunnerIdentityResolver;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import jakarta.servlet.FilterChain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Filtre de session déléguée (ADR-013) : transparent pour un utilisateur, fail-closed pour un runner.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("DeliverySessionFilter")
class DeliverySessionFilterTest {

    private static final String OWNER = "pierre@taskforce.dev";

    @Mock private LocalRunnerService localRunnerService;

    private DeliverySessionFilter filter;
    /** Authentification vue par le reste de la chaîne (null si la chaîne n'a pas été poursuivie). */
    private final AtomicReference<Authentication> seenDownstream = new AtomicReference<>();
    private final AtomicBoolean proceeded = new AtomicBoolean(false);
    private final FilterChain chain = (req, res) -> {
        proceeded.set(true);
        seenDownstream.set(SecurityContextHolder.getContext().getAuthentication());
    };

    @BeforeEach
    void setUp() {
        LocalRunnerSettings settings = new LocalRunnerSettings(true, "delivery-runner", "tf-runner-", "tf_runner_owner", 120, 10, 15);
        filter = new DeliverySessionFilter(new RunnerIdentityResolver(settings), localRunnerService);
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static Jwt runnerJwt() {
        return Jwt.withTokenValue("machine").header("alg", "RS256")
            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300))
            .claim("azp", "tf-runner-pierre")
            .claim("preferred_username", "service-account-tf-runner-pierre")
            .claim("realm_access", Map.of("roles", List.of("delivery-runner")))
            .claim("tf_runner_owner", OWNER)
            .build();
    }

    private static void authenticate(Jwt jwt) {
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
    }

    private MockHttpServletResponse run(String method, String path, String runHeader) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        if (runHeader != null) {
            request.addHeader(DeliverySessionFilter.RUN_HEADER, runHeader);
        }
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);
        return response;
    }

    private void sessionOpen() {
        when(localRunnerService.openSession(eq(100L), any(RunnerIdentity.class)))
            .thenReturn(new DeliverySession(100L, "acme", 12L, OWNER, "kc-7", "tf-runner-pierre"));
    }

    @Test
    @DisplayName("jeton d'utilisateur : le filtre ne touche à rien, même avec l'en-tête de session")
    void user_token_is_untouched() throws Exception {
        Jwt user = Jwt.withTokenValue("user").header("alg", "RS256")
            .claim("azp", "taskforce-api").claim("email", "dev@taskforce.dev").build();
        authenticate(user);

        MockHttpServletResponse response = run("DELETE", "/api/workspaces/acme/projects/12", "100");

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(((Jwt) seenDownstream.get().getPrincipal()).getClaimAsString("email")).isEqualTo("dev@taskforce.dev");
        verify(localRunnerService, never()).openSession(anyLong(), any());
    }

    @Test
    @DisplayName("runner sur ses endpoints machine : passe tel quel, sans délégation")
    void runner_api_passes_through_without_delegation() throws Exception {
        authenticate(runnerJwt());

        MockHttpServletResponse response = run("POST", "/api/delivery/runner/claim", null);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(((Jwt) seenDownstream.get().getPrincipal()).getClaimAsString("azp")).isEqualTo("tf-runner-pierre");
        verify(localRunnerService, never()).openSession(anyLong(), any());
    }

    @Test
    @DisplayName("session valide dans le périmètre : le principal devient celui du délégant, et rien d'autre")
    void valid_session_delegates_to_owner() throws Exception {
        authenticate(runnerJwt());
        sessionOpen();

        MockHttpServletResponse response = run("POST", "/api/workspaces/acme/projects/12/issues/5/comments", "100");

        assertThat(response.getStatus()).isEqualTo(200);
        Jwt delegated = (Jwt) seenDownstream.get().getPrincipal();
        assertThat(delegated.getClaimAsString("email")).isEqualTo(OWNER);
        assertThat(delegated.getClaimAsString("preferred_username")).isEqualTo(OWNER);
        assertThat(delegated.getSubject()).isEqualTo("kc-7");
        assertThat(delegated.<Long>getClaim("tf_delivery_run")).isEqualTo(100L);
        // Aucun claim du jeton machine n'est repris : ni rôle, ni propriétaire.
        assertThat(delegated.hasClaim("realm_access")).isFalse();
        assertThat(delegated.hasClaim("tf_runner_owner")).isFalse();
        assertThat(seenDownstream.get().getAuthorities()).isEmpty();
        assertThat(seenDownstream.get().isAuthenticated()).isTrue();
    }

    @ParameterizedTest(name = "refusé (403) : {0} {1} en-tête=[{2}]")
    @CsvSource(value = {
        "GET,    /api/workspaces/acme/projects,            NULL",   // pas d'en-tête de session
        "GET,    /api/workspaces/acme/projects,            ''",
        "GET,    /api/workspaces/acme/projects,            abc",
        "GET,    /api/workspaces/acme/projects,            99999999999999999999",
        "GET,    /api/users/me,                            100",    // hors workspace
        "GET,    /api/workspaces/other/projects,           100",    // autre workspace
        "GET,    /api/workspaces/acme/members,             100",    // lecture hors liste
        "POST,   /api/workspaces/acme/projects/99/issues,  100",    // écriture hors projet du run
        "DELETE, /api/workspaces/acme/projects/12/issues/5, 100",   // jamais de suppression
    }, nullValues = "NULL")
    void runner_out_of_session_is_denied(String method, String path, String header) throws Exception {
        authenticate(runnerJwt());
        org.mockito.Mockito.lenient().when(localRunnerService.openSession(eq(100L), any(RunnerIdentity.class)))
            .thenReturn(new DeliverySession(100L, "acme", 12L, OWNER, "kc-7", "tf-runner-pierre"));

        MockHttpServletResponse response = run(method, path, header);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(proceeded).isFalse(); // la chaîne n'a pas été poursuivie
        assertThat(response.getContentAsString()).contains("\"success\":false");
    }

    @Test
    @DisplayName("session refusée par le service (run terminé, autre runner...) : 403")
    void refused_session_is_denied() throws Exception {
        authenticate(runnerJwt());
        when(localRunnerService.openSession(eq(100L), any(RunnerIdentity.class)))
            .thenThrow(new ForbiddenException("Session de délégation invalide"));

        MockHttpServletResponse response = run("GET", "/api/workspaces/acme/projects", "100");

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(proceeded).isFalse();
    }

    @Test
    @DisplayName("jeton qui RESSEMBLE à un runner mais incomplet : refusé, jamais traité comme un utilisateur")
    void malformed_runner_token_is_denied() throws Exception {
        Jwt partial = Jwt.withTokenValue("partial").header("alg", "RS256")
            .claim("azp", "tf-runner-pierre")            // préfixe seul : ni rôle, ni propriétaire
            .claim("email", "pierre@taskforce.dev")       // tente de se faire passer pour un utilisateur
            .build();
        authenticate(partial);

        MockHttpServletResponse response = run("GET", "/api/workspaces/acme/projects", "100");

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(proceeded).isFalse();
        verify(localRunnerService, never()).openSession(anyLong(), any());
    }

    @Test
    @DisplayName("requête anonyme : laissée à la sécurité en aval")
    void anonymous_is_untouched() throws Exception {
        MockHttpServletResponse response = run("GET", "/api/workspaces/acme/projects", null);

        assertThat(proceeded).isTrue();
        assertThat(seenDownstream.get()).isNull();
    }
}
