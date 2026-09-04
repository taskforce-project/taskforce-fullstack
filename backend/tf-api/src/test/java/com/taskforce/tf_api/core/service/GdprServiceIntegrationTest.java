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

    @MockitoBean private KeycloakService keycloakService;
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
        // Portabilité complète (C11.3) : le paquet inclut aussi compétences + temps saisi (listes présentes).
        assertThat(export).containsKeys("skillProfiles", "worklogs");
        assertThat(export.get("skillProfiles")).isInstanceOf(java.util.List.class);
        assertThat(export.get("worklogs")).isInstanceOf(java.util.List.class);

        verify(auditService).record(isNull(), eq(user.getId()), eq(AuditService.GDPR_EXPORT));
    }

    @Test
    @DisplayName("exportMyData lève ResourceNotFoundException pour un user inconnu")
    void export_unknown_user() {
        assertThatThrownBy(() -> gdprService.exportMyData(999_999L))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("deleteMyAccount PLANIFIE (grâce) sans rien détruire ni anonymiser")
    void delete_schedules_grace() {
        gdprService.deleteMyAccount(user.getId());

        User reloaded = userRepository.findById(user.getId()).orElseThrow();
        assertThat(reloaded.getDeletionScheduledAt()).isNotNull(); // suppression planifiée
        assertThat(reloaded.getEmail()).isEqualTo("gdpr@it.dev");   // PAS encore anonymisé
        assertThat(reloaded.getIsActive()).isTrue();                // accès conservé (récupérable)
        // Rien n'est détruit à l'étape 1 : le workspace possédé est intact.
        assertThat(workspaceRepository.findBySlug("ws-gdpr")).isPresent();

        verify(auditService).record(isNull(), eq(user.getId()), eq(AuditService.GDPR_DELETE),
            eq("User"), eq(String.valueOf(user.getId())), org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("restoreMyAccount annule une suppression planifiée (récupération)")
    void restore_cancels_scheduled_deletion() {
        gdprService.deleteMyAccount(user.getId());
        gdprService.restoreMyAccount(user.getId());

        assertThat(userRepository.findById(user.getId()).orElseThrow().getDeletionScheduledAt()).isNull();
    }

    @Test
    @DisplayName("purgeAccount anonymise, coupe l'accès et supprime le workspace SOLO (aucun héritier)")
    void purge_anonymizes_and_deletes_solo_workspace() {
        gdprService.deleteMyAccount(user.getId()); // planifie (sinon purge = no-op)
        gdprService.purgeAccount(user.getId());

        User reloaded = userRepository.findById(user.getId()).orElseThrow();
        assertThat(reloaded.getEmail()).startsWith("deleted-").endsWith("@anonymized.invalid");
        assertThat(reloaded.getIsActive()).isFalse();
        assertThat(reloaded.getPlanStatus()).isEqualTo(PlanStatus.CANCELED);
        assertThat(reloaded.getDeletionScheduledAt()).isNull(); // purge effectuée
        // Workspace solo (aucun autre membre) → supprimé ; appartenances nettoyées.
        assertThat(workspaceRepository.findBySlug("ws-gdpr")).isEmpty();
        assertThat(workspaceMemberRepository.findByUserId(user.getId())).isEmpty();
    }
}
