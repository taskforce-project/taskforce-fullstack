package com.taskforce.tf_api.core.api;

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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDateTime;
import java.util.List;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.PasskeyResponse;
import com.taskforce.tf_api.core.dto.response.PasskeySignInOptionsResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.PasskeyService;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.RefreshTokenCookie;
import com.taskforce.tf_api.shared.security.SecurityConfig;

@WebMvcTest({PasskeyController.class, PasskeySignInController.class})
@Import({SecurityConfig.class, JwtIdentityResolver.class, RefreshTokenCookie.class})
@ActiveProfiles("test")
@DisplayName("Passkeys (@WebMvcTest)")
class PasskeyControllersWebMvcTest {

    private static final String CREDENTIAL = "{\"id\":\"abc\",\"rawId\":\"abc\",\"type\":\"public-key\",\"response\":{}}";

    @Autowired private MockMvc mockMvc;

    @MockitoBean private PasskeyService passkeys;
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
    @DisplayName("ajouter une passkey demande une session")
    void adding_needs_a_session() throws Exception {
        mockMvc.perform(post("/api/users/me/passkeys/options")).andExpect(status().isUnauthorized());
        verify(passkeys, never()).registrationOptions(anyLong());
    }

    @Test
    @DisplayName("options, ajout, liste et retrait au nom de la personne connectée")
    void manage_own_passkeys() throws Exception {
        knownUser();
        when(passkeys.registrationOptions(7L)).thenReturn(Map.of("challenge", "c"));
        when(passkeys.register(eq(7L), eq("Windows Hello"), any())).thenReturn(
            new PasskeyResponse("pk-1", "Windows Hello", LocalDateTime.of(2026, 10, 19, 20, 0), null));
        when(passkeys.list(7L)).thenReturn(List.of(
            new PasskeyResponse("pk-1", "Windows Hello", LocalDateTime.of(2026, 10, 19, 20, 0), null)));

        mockMvc.perform(post("/api/users/me/passkeys/options").with(session()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.challenge").value("c"));
        mockMvc.perform(post("/api/users/me/passkeys").with(session()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"label\":\"Windows Hello\",\"credential\":" + CREDENTIAL + "}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.data.id").value("pk-1"));
        mockMvc.perform(get("/api/users/me/passkeys").with(session()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].label").value("Windows Hello"));
        mockMvc.perform(delete("/api/users/me/passkeys/pk-1").with(session())).andExpect(status().isOk());
        verify(passkeys).delete(7L, "pk-1");
    }

    @Test
    @DisplayName("un ajout sans réponse du navigateur est refusé avant le service")
    void adding_validates_the_request() throws Exception {
        knownUser();
        mockMvc.perform(post("/api/users/me/passkeys").with(session()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"label\":\"x\"}"))
            .andExpect(status().isBadRequest());
        verify(passkeys, never()).register(anyLong(), any(), any());
    }

    @Test
    @DisplayName("se connecter par passkey : un défi, puis une session dont le renouvellement part en cookie")
    void sign_in_with_a_passkey() throws Exception {
        when(passkeys.signInOptions()).thenReturn(new PasskeySignInOptionsResponse("req-1", Map.of("challenge", "c")));
        when(passkeys.signIn(eq("req-1"), any())).thenReturn(AuthResponse.builder().accessToken("at").refreshToken("rt").build());

        mockMvc.perform(post("/api/auth/passkey/options"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.requestId").value("req-1"));
        mockMvc.perform(post("/api/auth/passkey/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"req-1\",\"credential\":" + CREDENTIAL + "}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.accessToken").value("at"))
            .andExpect(jsonPath("$.data.refreshToken").doesNotExist())
            .andExpect(header().exists("Set-Cookie"));
    }
}
