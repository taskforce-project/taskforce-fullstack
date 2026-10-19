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

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.WorkspaceService;

@ExtendWith(MockitoExtension.class)
@DisplayName("DesktopAccountBootstrap — utilisateur local du compte connecté")
class DesktopAccountBootstrapTest {

    private static final DesktopProperties PROPERTIES = new DesktopProperties("tfd_" + "a".repeat(40), "C:/data",
        new DesktopProperties.Account("kc-sub-1", "ada@example.com", "Ada", "Trial"));

    @Mock private UserRepository userRepository;
    @Mock private WorkspaceService workspaceService;

    private DesktopAccountBootstrap bootstrap() {
        return new DesktopAccountBootstrap(PROPERTIES, userRepository, workspaceService);
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
}
