package com.taskforce.tf_api.core.api;

import java.time.LocalDateTime;
import java.util.List;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.taskforce.tf_api.core.config.PersonalTokenScopeFilterConfig;
import com.taskforce.tf_api.core.dto.request.CreatePersonalAccessTokenRequest;
import com.taskforce.tf_api.core.dto.response.CreatedPersonalAccessTokenResponse;
import com.taskforce.tf_api.core.dto.response.PersonalAccessTokenResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.security.PersonalTokenAuthenticator;
import com.taskforce.tf_api.core.security.PersonalTokenScopeFilter;
import com.taskforce.tf_api.core.service.PersonalAccessTokenService;
import com.taskforce.tf_api.core.service.PersonalAccessTokenService.TokenPrincipal;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Jetons personnels de la personne connectée (OSS-5.1) : créés et révoqués avec une vraie session, jamais avec un
 * jeton personnel.
 */
@WebMvcTest(PersonalAccessTokenController.class)
@Import({SecurityConfig.class, JwtIdentityResolver.class, PersonalTokenAuthenticator.class, PersonalTokenScopeFilter.class,
    PersonalTokenScopeFilterConfig.class})
@ActiveProfiles("test")
@DisplayName("PersonalAccessTokenController (@WebMvcTest)")
class PersonalAccessTokenControllerWebMvcTest {

    private static final String TOKEN = "tfp_" + "k".repeat(43);

    @Autowired private MockMvc mockMvc;

    @MockitoBean private PersonalAccessTokenService tokenService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;             // WorkspaceAccessInterceptor
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository; // WorkspaceAccessInterceptor

    private static RequestPostProcessor session() {
        return jwt().jwt(b -> b.claim("email", "ada@taskforce.dev"));
    }

    private void knownUser() {
        when(userRepository.findByEmail("ada@taskforce.dev"))
            .thenReturn(Optional.of(User.builder().id(7L).email("ada@taskforce.dev").build()));
    }

    @Test
    void list_never_returns_values() throws Exception {
        knownUser();
        when(tokenService.list(7L)).thenReturn(List.of(new PersonalAccessTokenResponse(3L, "Laptop", "tfp_abcdefgh",
            LocalDateTime.of(2026, 10, 18, 12, 0), null, null, false)));

        mockMvc.perform(get("/api/users/me/tokens").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].hint").value("tfp_abcdefgh"))
            .andExpect(jsonPath("$.data[0].value").doesNotExist());
    }

    @Test
    void create_returns_the_value_once() throws Exception {
        knownUser();
        PersonalAccessTokenResponse token = new PersonalAccessTokenResponse(3L, "Laptop", "tfp_abcdefgh",
            LocalDateTime.of(2026, 10, 18, 12, 0), null, LocalDateTime.of(2027, 1, 16, 12, 0), false);
        when(tokenService.create(eq(7L), any(CreatePersonalAccessTokenRequest.class)))
            .thenReturn(new CreatedPersonalAccessTokenResponse(token, TOKEN));

        mockMvc.perform(post("/api/users/me/tokens").with(session()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Laptop\",\"expiresInDays\":90}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.value").value(TOKEN))
            .andExpect(jsonPath("$.data.token.name").value("Laptop"));
    }

    @Test
    void create_validates_the_request() throws Exception {
        mockMvc.perform(post("/api/users/me/tokens").with(session()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"\",\"expiresInDays\":4000}"))
            .andExpect(status().isBadRequest());
        verify(tokenService, never()).create(anyLong(), any());
    }

    @Test
    void revoke() throws Exception {
        knownUser();

        mockMvc.perform(delete("/api/users/me/tokens/3").with(session()))
            .andExpect(status().isOk());
        verify(tokenService).revoke(7L, 3L);
    }

    @Test
    void a_personal_token_cannot_manage_tokens() throws Exception {
        when(tokenService.authenticate(TOKEN)).thenReturn(Optional.of(new TokenPrincipal(3L, 7L, "ada@taskforce.dev", "kc-7")));

        mockMvc.perform(post("/api/users/me/tokens").header("Authorization", "Bearer " + TOKEN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"escalate\"}"))
            .andExpect(status().isForbidden());
        verify(tokenService, never()).create(anyLong(), any());
    }
}
