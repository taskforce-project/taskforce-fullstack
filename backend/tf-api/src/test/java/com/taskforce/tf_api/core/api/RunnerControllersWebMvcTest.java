package com.taskforce.tf_api.core.api;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.taskforce.tf_api.core.config.DeliverySessionFilterConfig;
import com.taskforce.tf_api.core.dto.response.RunnerProvisionResponse;
import com.taskforce.tf_api.core.dto.response.RunnerStatusResponse;
import com.taskforce.tf_api.core.dto.response.RunnerTokenResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.security.DeliverySessionFilter;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerService;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerSettings;
import com.taskforce.tf_api.core.service.delivery.RunnerIdentityResolver;
import com.taskforce.tf_api.core.service.delivery.RunnerProvisioningService;
import com.taskforce.tf_api.core.service.delivery.RunnerTokenIssuer;
import com.taskforce.tf_api.core.service.delivery.RunnerTokenIssuer.InvalidRunnerCredentialsException;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tranches web du jeton machine d'un runner et de son provisionnement en libre-service (ADR-013, OSS-5.7), filtre de
 * session déléguée branché comme en production.
 */
@WebMvcTest({RunnerAuthController.class, RunnerProvisioningController.class})
@Import({SecurityConfig.class, LocalRunnerSettings.class, RunnerIdentityResolver.class,
    DeliverySessionFilter.class, DeliverySessionFilterConfig.class})
@TestPropertySource(properties = "delivery.local-runner.enabled=true")
@ActiveProfiles("test")
@DisplayName("RunnerAuthController + RunnerProvisioningController (@WebMvcTest)")
class RunnerControllersWebMvcTest {

    private static final String EMAIL = "ada@taskforce.dev";

    @Autowired private MockMvc mockMvc;

    @MockitoBean private RunnerTokenIssuer tokenService;
    @MockitoBean private RunnerProvisioningService provisioningService;
    @MockitoBean private LocalRunnerService localRunnerService;               // DeliverySessionFilter
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;             // WorkspaceAccessInterceptor
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository; // WorkspaceAccessInterceptor

    private static RequestPostProcessor person() {
        return jwt().jwt(b -> b.claim("azp", "taskforce-api").claim("email", EMAIL));
    }

    private static RequestPostProcessor runner() {
        return jwt().jwt(b -> b
            .claim("azp", "tf-runner-u7")
            .claim("preferred_username", "service-account-tf-runner-u7")
            .claim("realm_access", Map.of("roles", List.of("delivery-runner")))
            .claim("tf_runner_owner", EMAIL));
    }

    private void knownPerson() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
    }

    // --------------------------------------------------------------------- jeton machine (public)

    @Test
    @DisplayName("POST /api/auth/runner/token : secret valide -> jeton, sans session")
    void token_is_issued_without_a_session() throws Exception {
        when(tokenService.issue("tf-runner-u7", "s3cret")).thenReturn(new RunnerTokenResponse("machine-token", 300));

        mockMvc.perform(post("/api/auth/runner/token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"tf-runner-u7\",\"clientSecret\":\"s3cret\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.accessToken").value("machine-token"))
            .andExpect(jsonPath("$.data.expiresIn").value(300));
    }

    @Test
    @DisplayName("POST /api/auth/runner/token : identifiants refusés -> 401, un seul message")
    void wrong_credentials_are_unauthorized() throws Exception {
        when(tokenService.issue(anyString(), anyString())).thenThrow(new InvalidRunnerCredentialsException());

        mockMvc.perform(post("/api/auth/runner/token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"tf-runner-u7\",\"clientSecret\":\"wrong\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.message").value("Invalid runner credentials"));
    }

    @ParameterizedTest(name = "POST /api/auth/runner/token : corps refusé (400) : {0}")
    @ValueSource(strings = {"{}", "{\"clientId\":\"tf-runner-u7\"}", "{\"clientId\":\"\",\"clientSecret\":\"x\"}"})
    void token_validates_the_body(String body) throws Exception {
        mockMvc.perform(post("/api/auth/runner/token").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
        verify(tokenService, never()).issue(any(), any());
    }

    // --------------------------------------------------------------------- provisionnement (une personne)

    @Test
    @DisplayName("GET /api/delivery/runners : état du runner de la personne, sans secret")
    void status_of_the_person_runner() throws Exception {
        knownPerson();
        when(provisioningService.status(any(User.class))).thenReturn(new RunnerStatusResponse(true, "tf-runner-u7", EMAIL));

        mockMvc.perform(get("/api/delivery/runners").with(person()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.exists").value(true))
            .andExpect(jsonPath("$.data.clientId").value("tf-runner-u7"))
            .andExpect(jsonPath("$.data.clientSecret").doesNotExist());
    }

    @Test
    @DisplayName("POST /api/delivery/runners : provisionne le runner de la personne et rend son secret une fois")
    void provision_returns_the_secret_once() throws Exception {
        knownPerson();
        when(provisioningService.provision(any(User.class))).thenReturn(new RunnerProvisionResponse("tf-runner-u7", "fresh-secret", EMAIL));

        mockMvc.perform(post("/api/delivery/runners").with(person()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.clientSecret").value("fresh-secret"))
            .andExpect(jsonPath("$.data.ownerEmail").value(EMAIL));
    }

    @Test
    @DisplayName("un runner ne peut pas se provisionner lui-même (403, hors de sa session)")
    void a_runner_cannot_provision_runners() throws Exception {
        mockMvc.perform(post("/api/delivery/runners").with(runner()))
            .andExpect(status().isForbidden());
        verify(provisioningService, never()).provision(any());
    }

    @Test
    @DisplayName("sans jeton : 401")
    void anonymous_is_unauthorized() throws Exception {
        mockMvc.perform(get("/api/delivery/runners")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("personne inconnue : 404")
    void unknown_person_is_not_found() throws Exception {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/delivery/runners").with(person())).andExpect(status().isNotFound());
        verify(provisioningService, never()).provision(any());
    }
}
