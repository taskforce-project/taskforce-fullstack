package com.taskforce.tf_api.core.desktop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.UpdateNotificationPreferencesRequest;
import com.taskforce.tf_api.core.dto.request.UpsertMemberSkillsRequest;
import com.taskforce.tf_api.core.dto.response.MemberSkillProfileResponse;
import com.taskforce.tf_api.core.model.NotificationPreference;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.NotificationPreferenceRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.MemberSkillProfileService;
import com.taskforce.tf_api.core.service.NotificationPreferenceService;
import com.taskforce.tf_api.core.service.UserService;
import com.taskforce.tf_api.core.service.WorkspaceService;

@ExtendWith(MockitoExtension.class)
@DisplayName("DesktopAccountBootstrap — utilisateur local du compte connecté")
class DesktopAccountBootstrapTest {

    @TempDir private Path dataDir;

    @Mock private UserRepository userRepository;
    @Mock private UserService userService;
    @Mock private WorkspaceService workspaceService;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private MemberSkillProfileService skillProfiles;
    @Mock private NotificationPreferenceService notificationPreferences;
    @Mock private NotificationPreferenceRepository notificationPreferenceRepository;
    @Mock private PlatformTransactionManager transactionManager;

    private DesktopAccountBootstrap bootstrap() {
        return bootstrap(null);
    }

    /** Lancement avec les réglages du compte en ligne, tels que la coque les passe (JSON de DesktopProfileResponse). */
    private DesktopAccountBootstrap bootstrap(String profileJson) {
        DesktopProperties properties = new DesktopProperties("tfd_" + "a".repeat(40), dataDir.toString(),
            new DesktopProperties.Account("kc-sub-1", "ada@example.com", "Ada", "Trial", profileJson));
        return new DesktopAccountBootstrap(properties, userRepository, userService, workspaceService, workspaceRepository, skillProfiles,
            notificationPreferences, notificationPreferenceRepository, new ObjectMapper(), transactionManager);
    }

    private static final String ONBOARDED_PROFILE = """
        {"jobTitle":"Engineering lead","onboardingCompleted":true,
         "skills":{"skills":["Java","React"],"seniority":"SENIOR","capacityHoursPerWeek":32,"growthEnabled":true,
                   "growthTargetSkills":["Rust"],"profileText":"Backend first"},
         "notifications":[{"eventKey":"assigned","inApp":true,"email":false}]}
        """;

    private void localWorkspace() {
        when(workspaceRepository.findAllByMemberId(1L)).thenReturn(List.of(Workspace.builder().id(5L).slug("ada").build()));
    }

    private boolean settingsTaken() {
        return Files.exists(dataDir.resolve(DesktopAccountBootstrap.SETTINGS_TAKEN_MARKER));
    }

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
    @DisplayName("récupération du compte : rôle, compétences et notifications repris, onboarding sauté, une seule fois")
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
        localWorkspace();

        bootstrap(ONBOARDED_PROFILE).run(null);

        assertThat(created[0].getJobTitle()).isEqualTo("Engineering lead");
        assertThat(created[0].getOnboardingCompleted()).isTrue();
        ArgumentCaptor<UpsertMemberSkillsRequest> skills = ArgumentCaptor.forClass(UpsertMemberSkillsRequest.class);
        verify(skillProfiles).upsert(eq("ada"), eq(1L), skills.capture(), eq(1L));
        assertThat(skills.getValue().getSkills()).containsExactly("Java", "React");
        assertThat(skills.getValue().getSeniority()).isEqualTo("SENIOR");
        ArgumentCaptor<UpdateNotificationPreferencesRequest> notifications = ArgumentCaptor.forClass(UpdateNotificationPreferencesRequest.class);
        verify(notificationPreferences).updatePreferences(eq(1L), notifications.capture());
        assertThat(notifications.getValue().getPreferences()).singleElement()
            .satisfies(item -> assertThat(item.getEventKey()).isEqualTo("assigned"));
        assertThat(settingsTaken()).isTrue();
    }

    @Test
    @DisplayName("compte connecté par une version précédente, onboarding fait dans l'app : seuls les manques sont comblés")
    void earlier_version_account_gets_what_it_lacks() {
        User user = User.builder().id(1L).keycloakId("kc-sub-1").email("ada@example.com").displayName("Ada")
            .onboardingCompleted(true).jobTitle("Local title").build();
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.of(user));
        localWorkspace();

        bootstrap(ONBOARDED_PROFILE).run(null);

        assertThat(user.getJobTitle()).isEqualTo("Local title");
        verify(userRepository, never()).save(any());
        verify(skillProfiles).upsert(eq("ada"), eq(1L), any(UpsertMemberSkillsRequest.class), eq(1L));
        verify(notificationPreferences).updatePreferences(eq(1L), any(UpdateNotificationPreferencesRequest.class));
        verify(workspaceService, never()).createWorkspace(any(), any());
    }

    @Test
    @DisplayName("ce qui est réglé dans l'app reste : compétences et notifications déjà là")
    void settings_made_in_the_app_stay() {
        User user = User.builder().id(1L).keycloakId("kc-sub-1").email("ada@example.com").displayName("Ada")
            .onboardingCompleted(true).jobTitle("Local title").build();
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.of(user));
        localWorkspace();
        when(skillProfiles.latestForUser(1L)).thenReturn(Optional.of(MemberSkillProfileResponse.builder().build()));
        when(notificationPreferenceRepository.findByUserId(1L)).thenReturn(List.of(NotificationPreference.builder().build()));

        bootstrap(ONBOARDED_PROFILE).run(null);

        verify(skillProfiles, never()).upsert(any(), any(), any(), any());
        verify(notificationPreferences, never()).updatePreferences(any(), any());
        assertThat(settingsTaken()).isTrue();
    }

    @Test
    @DisplayName("une fois la reprise faite sur ce poste, plus rien n'est repris")
    void settings_are_taken_once() throws Exception {
        Files.writeString(dataDir.resolve(DesktopAccountBootstrap.SETTINGS_TAKEN_MARKER), "rôle");
        User user = User.builder().id(1L).keycloakId("kc-sub-1").email("ada@example.com").displayName("Ada").build();
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.of(user));

        bootstrap(ONBOARDED_PROFILE).run(null);

        assertThat(user.getOnboardingCompleted()).isFalse();
        assertThat(user.getJobTitle()).isNull();
        verify(skillProfiles, never()).upsert(any(), any(), any(), any());
    }

    @Test
    @DisplayName("rien à reprendre : onboarding pas fait en ligne, réglages illisibles ou absents")
    void nothing_to_take() {
        User fresh = User.builder().id(1L).keycloakId("kc-sub-1").email("ada@example.com").displayName("Ada").build();
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.of(fresh));

        bootstrap("{\"jobTitle\":\"Lead\",\"onboardingCompleted\":false}").run(null);
        bootstrap("{not json").run(null);
        bootstrap(null).run(null);

        assertThat(fresh.getOnboardingCompleted()).isFalse();
        assertThat(fresh.getJobTitle()).isNull();
        verify(skillProfiles, never()).upsert(any(), any(), any(), any());
        verify(notificationPreferences, never()).updatePreferences(any(), any());
        assertThat(settingsTaken()).isFalse();
    }

    @Test
    @DisplayName("une reprise qui échoue ne bloque pas le démarrage de l'app")
    void a_failed_take_never_blocks_the_start() {
        User user = User.builder().id(1L).keycloakId("kc-sub-1").email("ada@example.com").displayName("Ada").build();
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.of(user));
        when(workspaceRepository.findAllByMemberId(1L)).thenThrow(new IllegalStateException("database unavailable"));

        assertThatCode(() -> bootstrap(ONBOARDED_PROFILE).run(null)).doesNotThrowAnyException();
        assertThat(settingsTaken()).isFalse();
    }

    /** Utilisateur local déjà créé, avec ou sans photo. */
    private User localUser(String avatarUrl) {
        User user = User.builder().id(1L).keycloakId("kc-sub-1").email("ada@example.com").displayName("Ada")
            .avatarUrl(avatarUrl).build();
        when(userRepository.findByKeycloakId("kc-sub-1")).thenReturn(Optional.of(user));
        return user;
    }

    /** Photo du compte en ligne déposée par la coque dans le dossier du compte. */
    private Path depositedPhoto(byte[] bytes) throws IOException {
        return Files.write(dataDir.resolve(DesktopAccountBootstrap.AVATAR_FILE), bytes);
    }

    private boolean photoMarked() {
        return Files.exists(dataDir.resolve(DesktopAccountBootstrap.AVATAR_TAKEN_MARKER));
    }

    @Test
    @DisplayName("photo du compte en ligne : reprise quand l'app n'en a pas, une seule fois, et le fichier déposé est effacé")
    void takes_the_account_photo_once() throws IOException {
        User user = localUser(null);
        byte[] photo = {1, 2, 3};
        Path deposited = depositedPhoto(photo);

        bootstrap().run(null);

        verify(userService).storeAvatar(user, photo, "image/jpeg");
        assertThat(deposited).doesNotExist();
        assertThat(photoMarked()).isTrue();

        depositedPhoto(photo);
        bootstrap().run(null);

        verify(userService, times(1)).storeAvatar(any(), any(), any());
        assertThat(deposited).doesNotExist();
    }

    static Stream<Arguments> photoNotTaken() {
        return Stream.of(
            Arguments.of("une photo choisie dans l'app l'emporte", "/api/files/avatars/1", new byte[] {1, 2, 3}, true),
            Arguments.of("une photo vide n'est pas reprise", null, new byte[0], true),
            Arguments.of("sans photo déposée, rien ne change", null, null, false));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("photoNotTaken")
    @DisplayName("photo du compte en ligne non reprise")
    void photo_not_taken(String scenario, String avatarUrl, byte[] deposited, boolean marked) throws IOException {
        localUser(avatarUrl);
        if (deposited != null) {
            depositedPhoto(deposited);
        }

        bootstrap().run(null);

        verify(userService, never()).storeAvatar(any(), any(), any());
        assertThat(dataDir.resolve(DesktopAccountBootstrap.AVATAR_FILE)).doesNotExist();
        assertThat(photoMarked()).isEqualTo(marked);
    }

    @Test
    @DisplayName("photo du compte en ligne : un échec ne bloque pas le démarrage, et la reprise sera retentée")
    void a_failed_photo_never_blocks_the_start() throws IOException {
        localUser(null);
        depositedPhoto(new byte[] {1});
        doThrow(new IllegalStateException("disk full")).when(userService).storeAvatar(any(), any(), any());

        assertThatCode(() -> bootstrap().run(null)).doesNotThrowAnyException();

        assertThat(dataDir.resolve(DesktopAccountBootstrap.AVATAR_FILE)).doesNotExist();
        assertThat(photoMarked()).isFalse();
    }
}
