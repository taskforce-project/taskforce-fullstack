package com.taskforce.tf_api.core.desktop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.UpdateNotificationPreferencesRequest;
import com.taskforce.tf_api.core.dto.request.UpsertMemberSkillsRequest;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.MemberSkillProfileService;
import com.taskforce.tf_api.core.service.NotificationPreferenceService;
import com.taskforce.tf_api.core.service.WorkspaceService;

@ExtendWith(MockitoExtension.class)
@DisplayName("DesktopAccountBootstrap — utilisateur local du compte connecté")
class DesktopAccountBootstrapTest {

    private static final DesktopProperties PROPERTIES = new DesktopProperties("tfd_" + "a".repeat(40), "C:/data",
        new DesktopProperties.Account("kc-sub-1", "ada@example.com", "Ada", "Trial", null));

    @Mock private UserRepository userRepository;
    @Mock private WorkspaceService workspaceService;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private MemberSkillProfileService skillProfiles;
    @Mock private NotificationPreferenceService notificationPreferences;

    private DesktopAccountBootstrap bootstrap() {
        return bootstrap(PROPERTIES);
    }

    private DesktopAccountBootstrap bootstrap(DesktopProperties properties) {
        return new DesktopAccountBootstrap(properties, userRepository, workspaceService, workspaceRepository, skillProfiles,
            notificationPreferences, new ObjectMapper());
    }

    /** Réglages du compte en ligne, tels que la coque les passe (JSON de DesktopProfileResponse). */
    private static DesktopProperties withProfile(String profileJson) {
        return new DesktopProperties("tfd_" + "a".repeat(40), "C:/data",
            new DesktopProperties.Account("kc-sub-1", "ada@example.com", "Ada", "Trial", profileJson));
    }

    private static final String ONBOARDED_PROFILE = """
        {"jobTitle":"Engineering lead","onboardingCompleted":true,
         "skills":{"skills":["Java","React"],"seniority":"SENIOR","capacityHoursPerWeek":32,"growthEnabled":true,
                   "growthTargetSkills":["Rust"],"profileText":"Backend first"},
         "notifications":[{"eventKey":"issue_assigned","inApp":true,"email":false}]}
        """;

    @Test
    @DisplayName("premier lancement : l'utilisateur et son premier workspace sont créés")
    void first_launch_creates_user_and_workspace() {
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("ada@example.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        bootstrap().run(null);

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertThat(saved.getValue().getKeycloakId()).isEqualTo("kc-sub-1");
        assertThat(saved.getValue().getEmail()).isEqualTo("ada@example.com");
        assertThat(saved.getValue().getDisplayName()).isEqualTo("Ada Trial");
        assertThat(saved.getValue().getIsActive()).isTrue();
        verify(workspaceService).createWorkspace(saved.getValue(), "Ada");
    }

    @Test
    @DisplayName("lancements suivants : rien n'est recréé, rien n'est réécrit")
    void later_launch_keeps_everything() {
        User user = User.builder().id(1L).keycloakId("kc-sub-1").email("ada@example.com").displayName("Ada L.").build();
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.of(user));

        bootstrap().run(null);

        verify(userRepository, never()).save(any());
        verify(workspaceService, never()).createWorkspace(any(), any());
        assertThat(user.getDisplayName()).isEqualTo("Ada L.");
    }

    @Test
    @DisplayName("l'adresse du compte hébergé fait foi : un changement est repris")
    void email_change_is_synced() {
        User user = User.builder().id(1L).keycloakId("kc-sub-1").email("old@example.com").displayName("Ada").build();
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.of(user));

        bootstrap().run(null);

        assertThat(user.getEmail()).isEqualTo("ada@example.com");
        verify(userRepository).save(user);
        verify(workspaceService, never()).createWorkspace(any(), any());
    }

    @Test
    @DisplayName("même adresse, autre identifiant : l'utilisateur local est rattaché au compte")
    void found_by_email_is_relinked() {
        User user = User.builder().id(1L).keycloakId("old-sub").email("ada@example.com").displayName(" ").build();
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("ada@example.com")).thenReturn(Optional.of(user));

        bootstrap().run(null);

        assertThat(user.getKeycloakId()).isEqualTo("kc-sub-1");
        assertThat(user.getDisplayName()).isEqualTo("Ada Trial");
        verify(userRepository).save(user);
    }

    @Test
    @DisplayName("récupération du compte : rôle, compétences et notifications repris, onboarding sauté")
    void first_launch_takes_the_account_settings() {
        User[] created = new User[1];
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("ada@example.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            if (user.getId() == null) user.setId(1L);
            created[0] = user;
            return user;
        });
        when(workspaceRepository.findAllByMemberId(1L)).thenReturn(java.util.List.of(Workspace.builder().id(5L).slug("ada").build()));

        bootstrap(withProfile(ONBOARDED_PROFILE)).run(null);

        assertThat(created[0].getJobTitle()).isEqualTo("Engineering lead");
        assertThat(created[0].getOnboardingCompleted()).isTrue();
        ArgumentCaptor<UpsertMemberSkillsRequest> skills = ArgumentCaptor.forClass(UpsertMemberSkillsRequest.class);
        verify(skillProfiles).upsert(org.mockito.ArgumentMatchers.eq("ada"), org.mockito.ArgumentMatchers.eq(1L), skills.capture(),
            org.mockito.ArgumentMatchers.eq(1L));
        assertThat(skills.getValue().getSkills()).containsExactly("Java", "React");
        assertThat(skills.getValue().getSeniority()).isEqualTo("SENIOR");
        ArgumentCaptor<UpdateNotificationPreferencesRequest> notifications = ArgumentCaptor.forClass(UpdateNotificationPreferencesRequest.class);
        verify(notificationPreferences).updatePreferences(org.mockito.ArgumentMatchers.eq(1L), notifications.capture());
        assertThat(notifications.getValue().getPreferences()).singleElement()
            .satisfies(item -> assertThat(item.getEventKey()).isEqualTo("issue_assigned"));
    }

    @Test
    @DisplayName("un compte déjà installé mais pas encore configuré reprend aussi ses réglages")
    void existing_user_without_onboarding_takes_them() {
        User user = User.builder().id(1L).keycloakId("kc-sub-1").email("ada@example.com").displayName("Ada").build();
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.of(user));
        when(workspaceRepository.findAllByMemberId(1L)).thenReturn(java.util.List.of(Workspace.builder().id(5L).slug("ada").build()));

        bootstrap(withProfile(ONBOARDED_PROFILE)).run(null);

        assertThat(user.getOnboardingCompleted()).isTrue();
        assertThat(user.getJobTitle()).isEqualTo("Engineering lead");
        verify(workspaceService, never()).createWorkspace(any(), any());
    }

    @Test
    @DisplayName("rien n'est repris : onboarding fait sur ce poste, pas fait en ligne, ou réglages illisibles")
    void nothing_to_take() {
        User done = User.builder().id(1L).keycloakId("kc-sub-1").email("ada@example.com").displayName("Ada")
            .onboardingCompleted(true).jobTitle("Local title").build();
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.of(done));
        bootstrap(withProfile(ONBOARDED_PROFILE)).run(null);
        assertThat(done.getJobTitle()).isEqualTo("Local title");

        User fresh = User.builder().id(1L).keycloakId("kc-sub-1").email("ada@example.com").displayName("Ada").build();
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.of(fresh));
        bootstrap(withProfile("{\"jobTitle\":\"Lead\",\"onboardingCompleted\":false}")).run(null);
        bootstrap(withProfile("{not json")).run(null);
        bootstrap(withProfile(null)).run(null);
        assertThat(fresh.getOnboardingCompleted()).isFalse();

        verify(skillProfiles, never()).upsert(any(), any(), any(), any());
        verify(notificationPreferences, never()).updatePreferences(any(), any());
    }
}
