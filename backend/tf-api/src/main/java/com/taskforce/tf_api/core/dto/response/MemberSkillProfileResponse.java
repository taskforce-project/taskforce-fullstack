package com.taskforce.tf_api.core.dto.response;

import java.util.List;

import lombok.Builder;
import lombok.Data;

/**
 * Profil de compétences d'un membre de workspace.
 * Aligné sur le contrat consommé par {@code SmartAssignService} (skills = tags).
 */
@Data
@Builder
public class MemberSkillProfileResponse {

    private Long userId;
    private List<String> skills;
    private String profileText;
    /** Capacité déclarée en heures/semaine (PROD-1.8 Phase 2), null si non renseignée. */
    private Integer capacityHoursPerWeek;
    /** Séniorité : JUNIOR | MID | SENIOR | LEAD, null si non renseignée. */
    private String seniority;
    /** Membre volontairement « en développement » (PROD-1.8 Phase 3 Inc C). */
    private boolean growthEnabled;
    /** Compétences cibles de montée en compétence. */
    private List<String> growthTargetSkills;
    /** ISO-8601, null si aucun profil enregistré. */
    private String updatedAt;
}
