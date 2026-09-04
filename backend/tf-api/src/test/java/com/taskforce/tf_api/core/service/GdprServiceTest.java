package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.IssueWorklogRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires - {@link GdprService} (TF-ACCT-DELETE : suppression en 2 temps + passage de flambeau).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("GdprService")
class GdprServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private IssueWorklogRepository issueWorklogRepository;
    @Mock private KeycloakService keycloakService;
    @Mock private AuditService auditService;
    @Mock private JdbcTemplate jdbcTemplate;

    private GdprService service;

    @BeforeEach
    void setup() {
        service = new GdprService(userRepository, workspaceMemberRepository, issueWorklogRepository,
            keycloakService, auditService, jdbcTemplate);
        ReflectionTestUtils.setField(service, "graceDays", 30);
    }

    private User user(Long id) {
        return User.builder().id(id).email("pierre@ex.com").keycloakId("kc-" + id).isActive(true).build();
    }

    @Test
    @DisplayName("deleteMyAccount : PLANIFIE (grâce), ne purge rien, renvoie la date de purge")
    void delete_schedules_only() {
        User u = user(1L);
        when(userRepository.findById(1L)).thenReturn(Optional.of(u));

        LocalDateTime purgeAt = service.deleteMyAccount(1L);

        assertThat(u.getDeletionScheduledAt()).isNotNull();
        assertThat(purgeAt).isAfter(LocalDateTime.now().plusDays(29));
        // Rien n'est détruit à l'étape 1 : aucune écriture SQL, aucune suppression Keycloak.
        org.mockito.Mockito.verifyNoInteractions(jdbcTemplate);
        verify(keycloakService, never()).deleteUser(anyString());
    }

    @Test
    @DisplayName("restoreMyAccount : efface la suppression planifiée")
    void restore_clears_schedule() {
        User u = user(1L);
        u.setDeletionScheduledAt(LocalDateTime.now().minusDays(2));
        when(userRepository.findById(1L)).thenReturn(Optional.of(u));

        service.restoreMyAccount(1L);

        assertThat(u.getDeletionScheduledAt()).isNull();
        verify(userRepository).save(u);
    }

    @Test
    @DisplayName("findExpiredForPurge : mappe les comptes au-delà du délai vers leurs ids")
    void find_expired_maps_ids() {
        when(userRepository.findByDeletionScheduledAtBefore(any()))
            .thenReturn(List.of(user(3L), user(7L)));

        assertThat(service.findExpiredForPurge()).containsExactly(3L, 7L);
    }

    @Test
    @DisplayName("purgeAccount : workspace partagé transféré (flambeau), solo supprimé, row anonymisé")
    @SuppressWarnings("unchecked")
    void purge_transfers_shared_deletes_solo() {
        User u = user(1L);
        u.setDeletionScheduledAt(LocalDateTime.now().minusDays(31));
        when(userRepository.findById(1L)).thenReturn(Optional.of(u));
        // 2 workspaces possédés : 10 (partagé) et 20 (solo).
        when(jdbcTemplate.queryForList(anyString(), eq(Long.class), any())).thenReturn(List.of(10L, 20L));
        // ws 10 → héritier 99 ; ws 20 → aucun (solo).
        when(jdbcTemplate.query(anyString(), any(ResultSetExtractor.class), eq(10L), eq(1L))).thenReturn(99L);
        when(jdbcTemplate.query(anyString(), any(ResultSetExtractor.class), eq(20L), eq(1L))).thenReturn(null);

        service.purgeAccount(1L);

        // Passage de flambeau sur le partagé, suppression du solo.
        verify(jdbcTemplate).update("UPDATE workspaces SET owner_id = ? WHERE id = ?", 99L, 10L);
        verify(jdbcTemplate).update("DELETE FROM workspaces WHERE id = ?", 20L);
        // Anonymisation + purge marquée terminée + accès IdP coupé.
        assertThat(u.getEmail()).isEqualTo("deleted-1@anonymized.invalid");
        assertThat(u.getIsActive()).isFalse();
        assertThat(u.getDeletionScheduledAt()).isNull();
        verify(keycloakService).deleteUser("kc-1"); // pas de tx active en test → after-commit exécuté immédiatement
    }

    @Test
    @DisplayName("purgeAccount : suppression déjà annulée (deletionScheduledAt null) → no-op")
    void purge_noop_if_restored() {
        User u = user(1L); // deletionScheduledAt = null
        when(userRepository.findById(1L)).thenReturn(Optional.of(u));

        service.purgeAccount(1L);

        verify(userRepository, never()).save(any());
        verify(keycloakService, never()).deleteUser(anyString());
    }
}
