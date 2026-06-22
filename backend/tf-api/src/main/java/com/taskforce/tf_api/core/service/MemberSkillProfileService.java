package com.taskforce.tf_api.core.service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.UpsertMemberSkillsRequest;
import com.taskforce.tf_api.core.dto.response.MemberSkillProfileResponse;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Gestion du profil de compétences des membres (table {@code member_skill_profiles}).
 *
 * <p>Accès JDBC direct — cohérent avec {@link SmartAssignService} qui lit déjà cette table
 * (colonnes {@code skills_json} JSONB + {@code embedding} vector(384), non mappables proprement
 * en JPA). Contrat : {@code skills_json} = tableau JSON de tags, relu par Smart Assign.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MemberSkillProfileService {

    private static final int MAX_SKILLS = 50;
    private static final int MAX_SKILL_LENGTH = 60;

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    // =========================================================================
    // Queries
    // =========================================================================

    @Transactional(readOnly = true)
    public List<MemberSkillProfileResponse> listProfiles(String slug, Long requesterId) {
        Workspace workspace = resolveWorkspace(slug);
        requireMember(workspace.getId(), requesterId);
        return jdbcTemplate.query(
            """
            SELECT user_id, skills_json::text AS skills_json, profile_text,
                   capacity_hours_per_week, seniority,
                   growth_enabled, growth_target_skills::text AS growth_target_skills, updated_at
            FROM member_skill_profiles
            WHERE workspace_id = ?
            """,
            (rs, rowNum) -> mapRow(rs),
            workspace.getId()
        );
    }

    @Transactional(readOnly = true)
    public MemberSkillProfileResponse getProfile(String slug, Long targetUserId, Long requesterId) {
        Workspace workspace = resolveWorkspace(slug);
        requireMember(workspace.getId(), requesterId);
        requireTargetMember(workspace.getId(), targetUserId);

        List<MemberSkillProfileResponse> rows = jdbcTemplate.query(
            """
            SELECT user_id, skills_json::text AS skills_json, profile_text,
                   capacity_hours_per_week, seniority,
                   growth_enabled, growth_target_skills::text AS growth_target_skills, updated_at
            FROM member_skill_profiles
            WHERE workspace_id = ? AND user_id = ?
            """,
            (rs, rowNum) -> mapRow(rs),
            workspace.getId(),
            targetUserId
        );
        return rows.isEmpty() ? empty(targetUserId) : rows.getFirst();
    }

    // =========================================================================
    // Commands
    // =========================================================================

    @Transactional
    public MemberSkillProfileResponse upsert(String slug, Long targetUserId,
                                             UpsertMemberSkillsRequest request, Long requesterId) {
        Workspace workspace = resolveWorkspace(slug);
        WorkspaceMember requester = requireMember(workspace.getId(), requesterId);
        requireTargetMember(workspace.getId(), targetUserId);

        boolean isSelf = requesterId.equals(targetUserId);
        boolean isManager = requester.getRole() == WorkspaceRole.OWNER
            || requester.getRole() == WorkspaceRole.ADMIN;
        if (!isSelf && !isManager) {
            throw new ForbiddenException(
                "Seul le membre concerné ou un administrateur peut modifier ce profil de compétences");
        }

        List<String> skills = normalizeSkills(request.getSkills());
        String profileText = request.getProfileText() == null || request.getProfileText().isBlank()
            ? null
            : request.getProfileText().strip();
        Integer capacity = request.getCapacityHoursPerWeek();
        String seniority = request.getSeniority();
        boolean growthEnabled = Boolean.TRUE.equals(request.getGrowthEnabled());
        String growthTargets = toJsonArray(normalizeSkills(request.getGrowthTargetSkills()));

        jdbcTemplate.update(
            """
            INSERT INTO member_skill_profiles
                (workspace_id, user_id, profile_text, skills_json, capacity_hours_per_week, seniority,
                 growth_enabled, growth_target_skills, updated_at)
            VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?::jsonb, NOW())
            ON CONFLICT (workspace_id, user_id)
            DO UPDATE SET profile_text             = EXCLUDED.profile_text,
                          skills_json              = EXCLUDED.skills_json,
                          capacity_hours_per_week  = EXCLUDED.capacity_hours_per_week,
                          seniority                = EXCLUDED.seniority,
                          growth_enabled           = EXCLUDED.growth_enabled,
                          growth_target_skills     = EXCLUDED.growth_target_skills,
                          updated_at               = NOW()
            """,
            workspace.getId(),
            targetUserId,
            profileText,
            toJsonArray(skills),
            capacity,
            seniority,
            growthEnabled,
            growthTargets
        );

        return getProfile(slug, targetUserId, requesterId);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private Workspace resolveWorkspace(String slug) {
        return workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
    }

    private WorkspaceMember requireMember(Long workspaceId, Long userId) {
        return workspaceMemberRepository.findByWorkspaceIdAndUserId(workspaceId, userId)
            .orElseThrow(() -> new ForbiddenException("Accès refusé au workspace"));
    }

    private void requireTargetMember(Long workspaceId, Long userId) {
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, userId)) {
            throw new ResourceNotFoundException("Membre introuvable dans ce workspace");
        }
    }

    /** Trim, retire les vides, dédoublonne (insensible à la casse), borne nombre et longueur. */
    private List<String> normalizeSkills(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        Map<String, String> deduped = new LinkedHashMap<>();
        for (String skill : raw) {
            if (skill == null) {
                continue;
            }
            String trimmed = skill.strip();
            if (trimmed.isEmpty()) {
                continue;
            }
            if (trimmed.length() > MAX_SKILL_LENGTH) {
                trimmed = trimmed.substring(0, MAX_SKILL_LENGTH).strip();
            }
            deduped.putIfAbsent(trimmed.toLowerCase(), trimmed);
            if (deduped.size() >= MAX_SKILLS) {
                break;
            }
        }
        return new ArrayList<>(deduped.values());
    }

    private String toJsonArray(List<String> skills) {
        try {
            return objectMapper.writeValueAsString(skills);
        } catch (Exception ex) {
            return "[]";
        }
    }

    private MemberSkillProfileResponse mapRow(ResultSet rs) throws SQLException {
        Timestamp updatedAt = rs.getTimestamp("updated_at");
        Integer capacity = rs.getObject("capacity_hours_per_week", Integer.class);
        return MemberSkillProfileResponse.builder()
            .userId(rs.getLong("user_id"))
            .skills(parseSkills(rs.getString("skills_json")))
            .profileText(rs.getString("profile_text"))
            .capacityHoursPerWeek(capacity)
            .seniority(rs.getString("seniority"))
            .growthEnabled(rs.getBoolean("growth_enabled"))
            .growthTargetSkills(parseSkills(rs.getString("growth_target_skills")))
            .updatedAt(updatedAt != null ? updatedAt.toInstant().toString() : null)
            .build();
    }

    /** Accepte un tableau {@code ["java","react"]} ou un objet {@code {"java":..}} (clés = skills). */
    private List<String> parseSkills(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(json);
            List<String> skills = new ArrayList<>();
            if (root.isArray()) {
                root.forEach(n -> skills.add(n.asText()));
            } else if (root.isObject()) {
                root.fieldNames().forEachRemaining(skills::add);
            }
            return skills;
        } catch (Exception ex) {
            log.debug("Profil skills_json illisible: {}", ex.getMessage());
            return List.of();
        }
    }

    private MemberSkillProfileResponse empty(Long userId) {
        return MemberSkillProfileResponse.builder()
            .userId(userId)
            .skills(List.of())
            .profileText(null)
            .growthEnabled(false)
            .growthTargetSkills(List.of())
            .updatedAt(null)
            .build();
    }
}
