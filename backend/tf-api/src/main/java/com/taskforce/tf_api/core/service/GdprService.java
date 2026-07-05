package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final JwtService jwtService;
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
     * Droit à l'effacement : anonymise le compte + révoque l'accès.
     * Conserve {@code keycloakId} (pour bloquer toute re-création via JIT) mais neutralise les PII
     * et désactive le compte (login refusé).
     */
    @Transactional
    public void deleteMyAccount(Long userId) {
        User u = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        // Anonymisation des données personnelles
        u.setEmail("deleted-" + u.getId() + "@anonymized.invalid");
        u.setDisplayName(null);
        u.setAvatarUrl(null);
        u.setStripeCustomerId(null);
        u.setStripeSubscriptionId(null);
        u.setPlanStatus(PlanStatus.CANCELED);
        u.setIsActive(false);
        userRepository.save(u);

        // Révocation de tous les refresh tokens (accès coupé)
        jwtService.revokeAllUserTokens(userId);

        auditService.record(null, userId, AuditService.GDPR_DELETE,
            "User", String.valueOf(userId), Map.of("anonymized", true));
        log.info("Compte {} anonymisé (droit à l'effacement RGPD)", userId);
        // NB : suppression du compte Keycloak associé = étape externe à effectuer séparément
        // (révocation côté IdP) ; ici l'accès est déjà coupé via isActive=false + tokens révoqués.
    }
}
