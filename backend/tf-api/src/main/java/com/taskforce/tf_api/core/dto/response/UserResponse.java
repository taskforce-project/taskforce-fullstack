package com.taskforce.tf_api.core.dto.response;

import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.enums.PlanType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * DTO de réponse contenant les informations de l'utilisateur
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserResponse {

    private Long id;
    private String keycloakId;
    private String email;
    private String firstName;
    private String lastName;
    private String displayName;
    private String avatarUrl;
    private String jobTitle;
    /** Vrai si l'utilisateur a déjà franchi l'onboarding — le front s'en sert pour (ne pas) l'afficher. */
    private Boolean onboardingCompleted;
    private PlanType planType;
    private PlanStatus planStatus;
    private LocalDateTime subscriptionStartDate;
    private LocalDateTime subscriptionEndDate;
    private LocalDateTime trialEndDate;
    private Boolean isActive;
    private LocalDateTime createdAt;
    /** Non nul si le compte est planifié pour suppression : date de PURGE effective (début de grâce +
     *  {@code deletion-grace-days}), i.e. le jour où le compte sera réellement supprimé. C'est cette
     *  date (et non le début de grâce brut de la colonne) que le front affiche dans le bandeau, pour
     *  être cohérent avec la date renvoyée par {@code DELETE /api/gdpr/account}. */
    private LocalDateTime scheduledPurgeAt;
}
