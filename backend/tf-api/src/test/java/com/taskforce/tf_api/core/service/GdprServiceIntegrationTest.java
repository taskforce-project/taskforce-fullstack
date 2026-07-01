package com.taskforce.tf_api.core.service;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;

/**
 * Tests d'intégration (RGPD / données, priorité critique) — {@link GdprService}.
 * Portabilité (export JSON) + droit à l'effacement (anonymisation + coupure d'accès + audit).
 * Repos réels ; {@code JwtService} et {@code AuditService} mockés.
 */
@DisplayName("GdprService (intégration Postgres)")
@Import(GdprService.class)
class GdprServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private GdprService gdprService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;

    @MockitoBean private JwtService jwtService;
    @MockitoBean private AuditService auditService;

    private User user;

    @BeforeEach
    void seed() {
        user = userRepository.save(User.builder()
            .keycloakId("kc-gdpr").email("gdpr@it.dev").displayName("RGPD User").isActive(true).build());
        Workspace ws = workspaceRepository.save(Workspace.builder().name("WS").slug("ws-gdpr").owner(user).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(ws).user(user).role(WorkspaceRole.OWNER).build());
    }

    @Test
    @DisplayName("exportMyData renvoie profil + appartenances et journalise l'export")
    void export_returns_profile_and_memberships() {
        Map<String, Object> export = gdprService.exportMyData(user.getId());

        @SuppressWarnings("unchecked")
        Map<String, Object> profile = (Map<String, Object>) export.get("profile");
        assertThat(profile.get("email")).isEqualTo("gdpr@it.dev");
        assertThat((java.util.List<?>) export.get("workspaceMemberships")).hasSize(1);

        verify(auditService).record(isNull(), eq(user.getId()), eq(AuditService.GDPR_EXPORT));
    }

    @Test
    @DisplayName("exportMyData lève ResourceNotFoundException pour un user inconnu")
    void export_unknown_user() {
        assertThatThrownBy(() -> gdprService.exportMyData(999_999L))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("deleteMyAccount anonymise le compte, coupe l'accès et journalise")
    void delete_anonymizes_and_revokes() {
        gdprService.deleteMyAccount(user.getId());

        User reloaded = userRepository.findById(user.getId()).orElseThrow();
        assertThat(reloaded.getEmail()).startsWith("deleted-").endsWith("@anonymized.invalid");
        assertThat(reloaded.getDisplayName()).isNull();
        assertThat(reloaded.getIsActive()).isFalse();
        assertThat(reloaded.getPlanStatus()).isEqualTo(PlanStatus.CANCELED);

        verify(jwtService).revokeAllUserTokens(user.getId());
        verify(auditService).record(isNull(), eq(user.getId()), eq(AuditService.GDPR_DELETE),
            eq("User"), eq(String.valueOf(user.getId())), org.mockito.ArgumentMatchers.any());
    }
}
