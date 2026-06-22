package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Mise à jour du profil de compétences d'un membre (utilisé par Smart Assign).
 * {@code skills} est persisté en tableau JSON dans {@code member_skill_profiles.skills_json}.
 */
@Data
public class UpsertMemberSkillsRequest {

    @Size(max = 50, message = "50 compétences maximum")
    private List<String> skills;

    @Size(max = 2000, message = "Le profil ne peut dépasser 2000 caractères")
    private String profileText;

    /** Capacité déclarée en heures/semaine (PROD-1.8 Phase 2). Optionnel. */
    @Min(value = 0, message = "La capacité ne peut être négative")
    @Max(value = 168, message = "La capacité ne peut dépasser 168 h/semaine")
    private Integer capacityHoursPerWeek;

    /** Séniorité : JUNIOR | MID | SENIOR | LEAD. Optionnel. */
    @Pattern(regexp = "JUNIOR|MID|SENIOR|LEAD", message = "Séniorité invalide")
    private String seniority;

    /** Membre volontairement « en développement » (PROD-1.8 Phase 3 Inc C). */
    private Boolean growthEnabled;

    /** Compétences cibles vers lesquelles faire progresser le membre. */
    @Size(max = 50, message = "50 compétences cibles maximum")
    private List<String> growthTargetSkills;
}
