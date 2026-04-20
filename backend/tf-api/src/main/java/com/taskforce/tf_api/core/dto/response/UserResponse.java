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
    private PlanType planType;
    private PlanStatus planStatus;
    private LocalDateTime subscriptionStartDate;
    private LocalDateTime subscriptionEndDate;
    private LocalDateTime trialEndDate;
    private Boolean isActive;
    private LocalDateTime createdAt;
}
