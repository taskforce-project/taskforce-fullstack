package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
 * <p>L'effacement est une <b>anonymisation</b> (pas un hard-delete) : les données personnelles
 * de l'utilisateur sont effacées/neutralisées et son accès révoqué, mais l'intégrité référentielle
 * (issues, commentaires, historique) est préservée — approche RGPD-compatible et non destructive.</p>
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
     * Droit à l'effacement : anonymise le compte local + supprime l'identité côté IdP (Keycloak).
     *
     * <p>La ligne {@code User} locale est conservée mais <b>anonymisée</b> (PII neutralisées,
     * {@code isActive=false}) pour préserver l'intégrité référentielle (issues, commentaires).
     * L'identité Keycloak, elle, est <b>supprimée</b> : c'est la véritable effacement des PII côté
     * IdP (TF-RGPD-007). L'appel Keycloak est un appel HTTP externe, déclenché <b>après commit</b>
     * de la transaction locale — un échec de l'IdP ne doit donc pas annuler l'anonymisation déjà
     * validée (il est journalisé pour rejeu manuel).</p>
     */
    @Transactional
    public void deleteMyAccount(Long userId) {
        User u = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        final String keycloakId = u.getKeycloakId();

        // Anonymisation des données personnelles
        u.setEmail("deleted-" + u.getId() + "@anonymized.invalid");
        u.setDisplayName(null);
        u.setAvatarUrl(null);
        u.setStripeCustomerId(null);
        u.setStripeSubscriptionId(null);
        u.setPlanStatus(PlanStatus.CANCELED);
        u.setIsActive(false);
        userRepository.save(u);

        // Accès coupé côté IdP : la suppression du compte Keycloak (ci-dessous, après commit)
        // invalide toutes les sessions/refresh tokens. Plus de table de refresh tokens custom.

        auditService.record(null, userId, AuditService.GDPR_DELETE,
            "User", String.valueOf(userId), Map.of("anonymized", true));
        log.info("Compte {} anonymisé (droit à l'effacement RGPD)", userId);

        // Suppression de l'identité Keycloak APRÈS commit : l'appel IdP externe ne doit pas
        // pouvoir annuler l'anonymisation locale déjà validée (préoccupation ACID). TF-RGPD-007.
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
