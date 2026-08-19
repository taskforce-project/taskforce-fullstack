package com.taskforce.tf_api.core.service;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link AuthorizationService} (B-T3, RBAC central PROD-3.2).
 *
 * <p>Couvre les 4 points d'entrée : {@code requireMember} (membre / non-membre → 403),
 * {@code requireRole} (rôle autorisé / refusé / varargs vide), {@code requireManager}
 * (OWNER/ADMIN acceptés, MEMBER refusé) et {@code isMember} (booléen, sans exception).</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AuthorizationService")
class AuthorizationServiceTest {

    private static final long WS_ID = 100L;
    private static final long USER_ID = 7L;

    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @InjectMocks private AuthorizationService service;

    private WorkspaceMember memberWithRole(WorkspaceRole role) {
        return WorkspaceMember.builder()
            .id(1L)
            .user(User.builder().id(USER_ID).email("u@ex.dev").displayName("U").build())
            .role(role)
            .build();
    }

    private void stubMember(WorkspaceRole role) {
        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(WS_ID, USER_ID))
            .thenReturn(Optional.of(memberWithRole(role)));
    }

    private void stubNoMember() {
        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(WS_ID, USER_ID))
            .thenReturn(Optional.empty());
    }

    // =========================================================================
    @Nested
    @DisplayName("requireMember")
    class RequireMember {

        @Test
        @DisplayName("renvoie le membre quand l'utilisateur appartient au workspace")
        void should_return_member_when_present() {
            stubMember(WorkspaceRole.MEMBER);

            WorkspaceMember result = service.requireMember(WS_ID, USER_ID);

            assertThat(result).isNotNull();
            assertThat(result.getRole()).isEqualTo(WorkspaceRole.MEMBER);
            assertThat(result.getUser().getId()).isEqualTo(USER_ID);
        }

        @Test
        @DisplayName("lève ForbiddenException quand l'utilisateur n'est pas membre")
        void should_throw_when_not_member() {
            stubNoMember();

            assertThatThrownBy(() -> service.requireMember(WS_ID, USER_ID))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("pas membre");
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("requireRole")
    class RequireRole {

        @Test
        @DisplayName("renvoie le membre quand son rôle fait partie des rôles autorisés")
        void should_return_member_when_role_allowed() {
            stubMember(WorkspaceRole.ADMIN);

            WorkspaceMember result = service.requireRole(WS_ID, USER_ID,
                WorkspaceRole.OWNER, WorkspaceRole.ADMIN);

            assertThat(result.getRole()).isEqualTo(WorkspaceRole.ADMIN);
        }

        @Test
        @DisplayName("lève ForbiddenException (permission insuffisante) quand le rôle n'est pas autorisé")
        void should_throw_when_role_not_allowed() {
            stubMember(WorkspaceRole.MEMBER);

            assertThatThrownBy(() -> service.requireRole(WS_ID, USER_ID, WorkspaceRole.OWNER))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("Permission insuffisante");
        }

        @Test
        @DisplayName("lève ForbiddenException (non-membre) avant même de vérifier le rôle")
        void should_throw_when_not_member() {
            stubNoMember();

            assertThatThrownBy(() -> service.requireRole(WS_ID, USER_ID, WorkspaceRole.MEMBER))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("pas membre");
        }

        @Test
        @DisplayName("sans aucun rôle autorisé (varargs vide), refuse même un membre valide")
        void should_throw_when_no_allowed_roles() {
            stubMember(WorkspaceRole.OWNER);

            assertThatThrownBy(() -> service.requireRole(WS_ID, USER_ID))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("Permission insuffisante");
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("requireManager")
    class RequireManager {

        @ParameterizedTest(name = "{0} est accepté comme manager")
        @EnumSource(value = WorkspaceRole.class, names = {"OWNER", "ADMIN"})
        @DisplayName("accepte OWNER et ADMIN")
        void should_accept_owner_and_admin(WorkspaceRole role) {
            stubMember(role);

            WorkspaceMember result = service.requireManager(WS_ID, USER_ID);

            assertThat(result.getRole()).isEqualTo(role);
        }

        @Test
        @DisplayName("refuse un simple MEMBER")
        void should_reject_plain_member() {
            stubMember(WorkspaceRole.MEMBER);

            assertThatThrownBy(() -> service.requireManager(WS_ID, USER_ID))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("Permission insuffisante");
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("isMember")
    class IsMember {

        @Test
        @DisplayName("renvoie true quand l'appartenance existe")
        void should_return_true_when_member() {
            when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(WS_ID, USER_ID)).thenReturn(true);

            assertThat(service.isMember(WS_ID, USER_ID)).isTrue();
        }

        @Test
        @DisplayName("renvoie false quand l'appartenance n'existe pas (sans lever d'exception)")
        void should_return_false_when_not_member() {
            when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(WS_ID, USER_ID)).thenReturn(false);

            assertThat(service.isMember(WS_ID, USER_ID)).isFalse();
        }
    }
}
