package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.IssueWorklogRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Droits des personnes RGPD (CERT-C11.3) : portabilité (export) et droit à l'effacement.
 *
 * <p>L'effacement supprime tout le <b>footprint</b> du compte (workspaces possédés + leur contenu en
 * cascade, appartenances, profils de compétences, secret 2FA) et l'identité Keycloak, puis
 * <b>anonymise le row {@code User} résiduel</b> (tombstone) au lieu d'un hard-delete : ce qui reste ne
 * porte plus aucune donnée personnelle mais préserve l'intégrité référentielle des contenus laissés
 * dans les workspaces d'autrui (issues, commentaires). Approche RGPD-compatible.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GdprService {

    private final UserRepository userRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final IssueWorklogRepository issueWorklogRepository;
    private final KeycloakService keycloakService;
    private final AuditService auditService;
    private final JdbcTemplate jdbcTemplate;

    /** Délai de grâce (jours) avant la purge réelle d'un compte dont la suppression a été demandée. */
    @Value("${taskforce.account.deletion-grace-days:30}")
    private int graceDays;

    // NB : read-write (PAS readOnly) — l'export journalise un audit GDPR_EXPORT (INSERT).
    // Sous readOnly, l'INSERT échoue (SQLSTATE 25006) et marque la tx rollback-only → 500 (cf. FIX-006).
    /** Export des données personnelles de l'utilisateur (portabilité — JSON). */
    @Transactional
    public Map<String, Object> exportMyData(Long userId) {
        User u = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", u.getId());
        profile.put("email", u.getEmail());
        profile.put("displayName", u.getDisplayName());
        profile.put("avatarUrl", u.getAvatarUrl());
        profile.put("planType", u.getPlanType());
        profile.put("planStatus", u.getPlanStatus());
        profile.put("createdAt", u.getCreatedAt());
        profile.put("updatedAt", u.getUpdatedAt());

        List<Map<String, Object>> memberships = workspaceMemberRepository.findByUserId(userId).stream()
            .map(m -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("workspace", m.getWorkspace().getName());
                row.put("slug", m.getWorkspace().getSlug());
                row.put("role", m.getRole().name());
                row.put("joinedAt", m.getJoinedAt());
                return row;
            })
            .toList();

        // Profils de compétences (SQL brut : member_skill_profiles n'a pas d'entité JPA).
        List<Map<String, Object>> skillProfiles = jdbcTemplate.query(
            """
            SELECT ws.slug AS workspace_slug, ws.name AS workspace_name,
                   p.skills_json::text AS skills, p.seniority, p.capacity_hours_per_week,
                   p.profile_text, p.growth_enabled, p.growth_target_skills::text AS growth_target_skills
            FROM member_skill_profiles p
            JOIN workspaces ws ON ws.id = p.workspace_id
            WHERE p.user_id = ?
            """,
            (rs, n) -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("workspace", rs.getString("workspace_name"));
                row.put("slug", rs.getString("workspace_slug"));
                row.put("skills", rs.getString("skills"));
                row.put("seniority", rs.getString("seniority"));
                row.put("capacityHoursPerWeek", rs.getObject("capacity_hours_per_week"));
                row.put("profileText", rs.getString("profile_text"));
                row.put("growthEnabled", rs.getObject("growth_enabled"));
                row.put("growthTargetSkills", rs.getString("growth_target_skills"));
                return row;
            },
            userId);

        // Worklogs (temps saisi par l'utilisateur).
        List<Map<String, Object>> worklogs = issueWorklogRepository
            .findByUser_IdOrderByLoggedAtDescIdDesc(userId).stream()
            .map(w -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("issueId", w.getIssueId());
                row.put("minutes", w.getMinutes());
                row.put("description", w.getDescription());
                row.put("loggedAt", w.getLoggedAt());
                return row;
            })
            .toList();

        auditService.record(null, userId, AuditService.GDPR_EXPORT);

        Map<String, Object> export = new LinkedHashMap<>();
        export.put("exportedAt", LocalDateTime.now());
        export.put("profile", profile);
        export.put("workspaceMemberships", memberships);
        export.put("skillProfiles", skillProfiles);
        export.put("worklogs", worklogs);
        return export;
    }

    /**
     * Droit à l'effacement - étape 1 : <b>PLANIFIE</b> la suppression (délai de grâce). Rien n'est
     * détruit ici (ni workspaces, ni identité IdP) : le compte reste récupérable via
     * {@link #restoreMyAccount} jusqu'à la purge réelle ({@link #purgeAccount}), faite par un job
     * au-delà du délai. Évite la perte accidentelle et définitive constatée (supprimer son compte
     * détruisait instantanément Nimbus et les workspaces partagés). Idempotent : re-demander ne
     * réinitialise pas la date.
     *
     * @return la date de purge prévue (demande + délai de grâce).
     */
    @Transactional
    public LocalDateTime deleteMyAccount(Long userId) {
        User u = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        if (u.getDeletionScheduledAt() == null) {
            u.setDeletionScheduledAt(LocalDateTime.now());
            userRepository.save(u);
            auditService.record(null, userId, AuditService.GDPR_DELETE,
                "User", String.valueOf(userId), Map.of("scheduled", true, "graceDays", graceDays));
            log.info("Compte {} : suppression planifiée (grâce {} j)", userId, graceDays);
        }
        return u.getDeletionScheduledAt().plusDays(graceDays);
    }

    /** Annule une suppression planifiée (récupération pendant le délai de grâce). No-op si rien n'est planifié. */
    @Transactional
    public void restoreMyAccount(Long userId) {
        User u = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        if (u.getDeletionScheduledAt() != null) {
            u.setDeletionScheduledAt(null);
            userRepository.save(u);
            auditService.record(null, userId, AuditService.GDPR_DELETE,
                "User", String.valueOf(userId), Map.of("restored", true));
            log.info("Compte {} : suppression annulée (compte restauré)", userId);
        }
    }

    /** Ids des comptes dont le délai de grâce est écoulé (à purger). Consommé par le scheduler. */
    public List<Long> findExpiredForPurge() {
        return userRepository.findByDeletionScheduledAtBefore(LocalDateTime.now().minusDays(graceDays))
            .stream().map(User::getId).toList();
    }

    /**
     * Droit à l'effacement - étape 2 : purge RÉELLE (appelée par le scheduler au-delà du délai). Passage
     * de flambeau des workspaces partagés (transférés au membre le plus ancien, leur travail survit) et
     * suppression des workspaces solo, puis anonymisation du row + suppression de l'identité Keycloak.
     * No-op si la suppression a été annulée entre-temps.
     *
     * <p>SQL brut (et NON des delete d'entités JPA) volontairement : supprimer une entité Workspace
     * managée alors qu'un WorkspaceMember la référence encore en session lève
     * TransientPropertyValueException. La cascade DB (FK ON DELETE CASCADE) fait le ménage sous les
     * workspaces supprimés (projets, issues, membres, invitations, connecteurs).</p>
     */
    @Transactional
    public void purgeAccount(Long userId) {
        User u = userRepository.findById(userId).orElse(null);
        if (u == null || u.getDeletionScheduledAt() == null) return; // annulé/restauré ou déjà purgé

        final String keycloakId = u.getKeycloakId();

        int transferred = 0, deleted = 0;
        for (Long wsId : jdbcTemplate.queryForList(
                "SELECT id FROM workspaces WHERE owner_id = ?", Long.class, userId)) {
            Long heir = jdbcTemplate.query(
                "SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id <> ? " +
                "ORDER BY joined_at ASC, id ASC LIMIT 1",
                rs -> rs.next() ? rs.getLong(1) : null, wsId, userId);
            if (heir != null) {
                jdbcTemplate.update("UPDATE workspaces SET owner_id = ? WHERE id = ?", heir, wsId); // passage de flambeau
                transferred++;
            } else {
                jdbcTemplate.update("DELETE FROM workspaces WHERE id = ?", wsId); // solo → cascade DB
                deleted++;
            }
        }
        jdbcTemplate.update("DELETE FROM workspace_members WHERE user_id = ?", userId);      // appartenances (dont workspaces transférés)
        jdbcTemplate.update("DELETE FROM member_skill_profiles WHERE user_id = ?", userId);
        jdbcTemplate.update("DELETE FROM user_two_factor WHERE user_id = ?", userId);        // secret 2FA (TOTP)

        // Anonymiser le row résiduel (tombstone) : gardé UNIQUEMENT pour l'intégrité référentielle des
        // contenus laissés ailleurs (issues, commentaires) ; plus aucune donnée perso, accès coupé.
        u.setEmail("deleted-" + u.getId() + "@anonymized.invalid");
        u.setDisplayName(null);
        u.setAvatarUrl(null);
        u.setStripeCustomerId(null);
        u.setStripeSubscriptionId(null);
        u.setPlanStatus(PlanStatus.CANCELED);
        u.setIsActive(false);
        u.setDeletionScheduledAt(null); // purge effectuée
        userRepository.save(u);

        auditService.record(null, userId, AuditService.GDPR_DELETE, "User", String.valueOf(userId),
            Map.of("purged", true, "workspacesTransferred", transferred, "workspacesDeleted", deleted));
        log.info("Compte {} purgé : {} workspace(s) transféré(s), {} supprimé(s), row anonymisé",
            userId, transferred, deleted);

        // Suppression Keycloak APRÈS commit : l'appel IdP externe ne doit pas annuler la purge locale
        // déjà validée (ACID). TF-RGPD-007.
        if (keycloakId != null && !keycloakId.isBlank()) {
            deleteKeycloakIdentityAfterCommit(keycloakId, userId);
        }
    }

    /**
     * Planifie (ou exécute) la suppression du compte Keycloak. Si une transaction est active,
     * l'appel est différé à {@code afterCommit} ; sinon il est exécuté immédiatement. Dans tous
     * les cas, un échec est journalisé sans être propagé (rejeu manuel côté IdP).
     */
    private void deleteKeycloakIdentityAfterCommit(String keycloakId, Long userId) {
        Runnable deletion = () -> {
            try {
                keycloakService.deleteUser(keycloakId);
                log.info("Identité Keycloak {} supprimée (effacement RGPD du compte {})", keycloakId, userId);
            } catch (Exception e) {
                // Ne jamais propager : l'accès est déjà coupé (isActive=false + tokens révoqués).
                log.error("Échec suppression Keycloak {} pour le compte {} — à rejouer manuellement : {}",
                    keycloakId, userId, e.getMessage());
            }
        };

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    deletion.run();
                }
            });
        } else {
            deletion.run();
        }
    }
}
