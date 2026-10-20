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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.taskforce.tf_api.core.dto.request.DesktopAuthorizeRequest;
import com.taskforce.tf_api.core.dto.request.DesktopTokenRequest;
import com.taskforce.tf_api.core.dto.response.DesktopAccountResponse;
import com.taskforce.tf_api.core.dto.response.DesktopSessionInfoResponse;
import com.taskforce.tf_api.core.dto.response.DesktopSessionResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.DesktopSessionService;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.SecurityConfig;

@WebMvcTest({DesktopSignInController.class, DesktopSessionController.class})
@Import({SecurityConfig.class, JwtIdentityResolver.class})
@ActiveProfiles("test")
@DisplayName("Sessions de l'app desktop (@WebMvcTest)")
class DesktopSessionControllersWebMvcTest {

    private static final String TOKEN = "tfa_" + "s".repeat(43);
    private static final DesktopAccountResponse ADA = new DesktopAccountResponse("kc-ada", "ada@taskforce.dev", "Ada", "Lovelace", null);

    @Autowired private MockMvc mockMvc;

    @MockitoBean private DesktopSessionService sessions;
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
    @DisplayName("l'accord exige une session de la webapp")
    void authorize_needs_a_web_session() throws Exception {
        mockMvc.perform(post("/api/users/me/desktop-sessions/authorize").contentType(MediaType.APPLICATION_JSON)
                .content("{\"codeChallenge\":\"c\",\"redirectUri\":\"http://127.0.0.1:47812/callback\",\"state\":\"s\"}"))
            .andExpect(status().isUnauthorized());
        verify(sessions, never()).authorize(anyLong(), any());
    }

    @Test
    @DisplayName("l'accord rend l'adresse de retour de l'app")
    void authorize_returns_the_redirect() throws Exception {
        knownUser();
        when(sessions.authorize(eq(7L), any(DesktopAuthorizeRequest.class)))
            .thenReturn("http://127.0.0.1:47812/callback?code=abc&state=state-1234");

        mockMvc.perform(post("/api/users/me/desktop-sessions/authorize").with(session()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"codeChallenge\":\"c\",\"redirectUri\":\"http://127.0.0.1:47812/callback\",\"state\":\"state-1234\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.redirectUrl").value("http://127.0.0.1:47812/callback?code=abc&state=state-1234"));
    }

    @Test
    @DisplayName("l'app échange son code sans session de la webapp")
    void token_is_public() throws Exception {
        when(sessions.exchange(any(DesktopTokenRequest.class)))
            .thenReturn(new DesktopSessionResponse(TOKEN, LocalDateTime.of(2027, 1, 17, 20, 0), ADA));

        mockMvc.perform(post("/api/auth/desktop/token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"abc\",\"codeVerifier\":\"" + "v".repeat(43) + "\",\"redirectUri\":\"http://127.0.0.1:47812/callback\",\"deviceName\":\"Windows\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.token").value(TOKEN))
            .andExpect(jsonPath("$.data.account.subject").value("kc-ada"));
    }

    @Test
    @DisplayName("un échange incomplet est refusé avant le service")
    void token_validates_the_request() throws Exception {
        mockMvc.perform(post("/api/auth/desktop/token").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"\"}"))
            .andExpect(status().isBadRequest());
        verify(sessions, never()).exchange(any());
    }

    @Test
    @DisplayName("relire le compte : 200 si la session vit, 401 sinon")
    void session_is_read_or_ended() throws Exception {
        when(sessions.refresh(TOKEN)).thenReturn(Optional.of(new DesktopSessionResponse(null, LocalDateTime.of(2027, 1, 17, 20, 0), ADA)));
        mockMvc.perform(post("/api/auth/desktop/session").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"" + TOKEN + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.account.email").value("ada@taskforce.dev"))
            .andExpect(jsonPath("$.data.token").doesNotExist());

        when(sessions.refresh(TOKEN)).thenReturn(Optional.empty());
        mockMvc.perform(post("/api/auth/desktop/session").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"" + TOKEN + "\"}"))
            .andExpect(status().isUnauthorized());
    }

    static Stream<Arguments> unreadable_bodies() {
        return Stream.of(
            Arguments.of("sans corps ni type de contenu (vu en prod le 20/10)", null, null, 400),
            Arguments.of("JSON vide", MediaType.APPLICATION_JSON_VALUE, "", 400),
            Arguments.of("JSON mal formé", MediaType.APPLICATION_JSON_VALUE, "{\"token\":", 400),
            Arguments.of("JSON d'une autre forme", MediaType.APPLICATION_JSON_VALUE, "[\"" + TOKEN + "\"]", 400),
            Arguments.of("formulaire au lieu de JSON", MediaType.APPLICATION_FORM_URLENCODED_VALUE, "token=" + TOKEN, 415));
    }

    @ParameterizedTest(name = "{0} : {3}")
    @MethodSource("unreadable_bodies")
    @DisplayName("un corps absent ou illisible est une erreur du client, jamais un 500")
    void unreadable_body_is_a_client_error(String label, String contentType, String body, int expected) throws Exception {
        MockHttpServletRequestBuilder request = post("/api/auth/desktop/session");
        if (contentType != null) request.contentType(contentType);
        if (body != null) request.content(body);

        mockMvc.perform(request)
            .andExpect(status().is(expected))
            .andExpect(jsonPath("$.status").value(expected))
            .andExpect(jsonPath("$.path").value("/api/auth/desktop/session"));
        verify(sessions, never()).refresh(any());
    }

    @Test
    @DisplayName("l'app ferme sa session")
    void revoke_from_the_app() throws Exception {
        mockMvc.perform(post("/api/auth/desktop/revoke").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"" + TOKEN + "\"}"))
            .andExpect(status().isOk());
        verify(sessions).revoke(TOKEN);
    }

    @Test
    @DisplayName("les réglages listent les ordinateurs connectés et en déconnectent un")
    void list_and_revoke_from_the_settings() throws Exception {
        knownUser();
        when(sessions.list(7L)).thenReturn(List.of(new DesktopSessionInfoResponse(1L, "Windows",
            LocalDateTime.of(2026, 10, 19, 20, 0), null, LocalDateTime.of(2027, 1, 17, 20, 0))));

        mockMvc.perform(get("/api/users/me/desktop-sessions").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].name").value("Windows"))
            .andExpect(jsonPath("$.data[0].token").doesNotExist());

        mockMvc.perform(delete("/api/users/me/desktop-sessions/1").with(session()))
            .andExpect(status().isOk());
        verify(sessions).revoke(7L, 1L);
    }
}
