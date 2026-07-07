package com.taskforce.tf_api.core.api;

import java.util.List;
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
import com.taskforce.tf_api.core.service.DiscussionService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.NotificationService;
import com.taskforce.tf_api.core.service.ProfileService;
import com.taskforce.tf_api.core.service.TeamService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web — GET principaux de plusieurs controllers workspace
 * (Notification, Team, MyWork, Roadmap, Discussion, Profile). Services mockés.
 */
@WebMvcTest({NotificationController.class, TeamController.class, MyWorkController.class,
             RoadmapController.class, DiscussionController.class, ProfileController.class})
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("Misc controllers (@WebMvcTest)")
class MiscControllersWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private NotificationService notificationService;
    @MockitoBean private TeamService teamService;
    @MockitoBean private IssueService issueService;
    @MockitoBean private DiscussionService discussionService;
    @MockitoBean private ProfileService profileService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET notifications / teams / my-issues / roadmap / discussions / profile → 200")
    void all_gets_200() throws Exception {
        when(notificationService.listNotifications(anyString(), anyLong())).thenReturn(List.of());
        when(teamService.listTeams(anyString())).thenReturn(List.of());
        when(issueService.listMyIssues(anyString(), anyLong())).thenReturn(List.of());
        when(issueService.getScheduledIssues(anyString(), anyLong())).thenReturn(List.of());
        when(discussionService.listDiscussions(anyString(), any())).thenReturn(List.of());
        when(profileService.getProfile(anyString(), anyLong())).thenReturn(null);

        mockMvc.perform(get("/api/workspaces/acme/notifications").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get("/api/workspaces/acme/teams").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get("/api/workspaces/acme/my-issues").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get("/api/workspaces/acme/roadmap").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get("/api/workspaces/acme/discussions").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get("/api/workspaces/acme/profile").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET notifications sans JWT → 401")
    void unauthenticated_401() throws Exception {
        mockMvc.perform(get("/api/workspaces/acme/notifications")).andExpect(status().isUnauthorized());
    }
}
