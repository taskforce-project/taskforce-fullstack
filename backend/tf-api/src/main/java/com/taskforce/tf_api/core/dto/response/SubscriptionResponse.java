package com.taskforce.tf_api.core.dto.response;

import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.enums.PlanType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * DTO de réponse contenant les détails de l'abonnement
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SubscriptionResponse {

    private Long id;
    private Long userId;
    private PlanType planType;
    private PlanStatus status;
    private BigDecimal amount;
    private String currency;
    private String billingInterval;
    private LocalDateTime currentPeriodStart;
    private LocalDateTime currentPeriodEnd;
    private LocalDateTime trialEnd;
    private Boolean cancelAtPeriodEnd;
    private LocalDateTime startedAt;
    private LocalDateTime createdAt;
}
