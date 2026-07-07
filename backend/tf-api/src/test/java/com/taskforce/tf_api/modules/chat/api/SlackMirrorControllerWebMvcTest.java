package com.taskforce.tf_api.modules.chat.api;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.modules.chat.service.SlackMirrorService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SlackMirrorController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("SlackMirrorController (@WebMvcTest)")
class SlackMirrorControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private SlackMirrorService mirrorService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        return jwt().jwt(b -> b.claim("email", "dev@it.dev"));
    }

    private void stubUser() {
        when(userRepository.findByEmail(anyString()))
            .thenReturn(Optional.of(User.builder().id(7L).email("dev@it.dev").build()));
    }

    @Test
    @DisplayName("POST mirror (auth) → 200 + mirrorChannelId")
    void enable_mirror_200() throws Exception {
        stubUser();
        when(mirrorService.enableMirror(anyString(), anyLong(), anyLong())).thenReturn(42L);

        mockMvc.perform(post("/api/workspaces/acme/integrations/slack/channels/3/mirror").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.mirrorChannelId").value(42));
    }

    @Test
    @DisplayName("POST sync (auth) → 200 + imported")
    void sync_200() throws Exception {
        stubUser();
        when(mirrorService.sync(anyString(), anyLong())).thenReturn(5);

        mockMvc.perform(post("/api/workspaces/acme/integrations/slack/channels/3/sync").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.imported").value(5));
    }

    @Test
    @DisplayName("POST mirror sans JWT → 401")
    void mirror_unauthenticated_401() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/integrations/slack/channels/3/mirror"))
            .andExpect(status().isUnauthorized());
    }
}
