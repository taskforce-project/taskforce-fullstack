package com.taskforce.tf_api.modules.sales.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * DTO de réponse après création d'une demande ENTERPRISE.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EnterpriseInquiryResponse {

    private UUID inquiryId;
    private String fullName;
    private String email;
    private String teamSize;
    private String status;
    private LocalDateTime createdAt;
    private String message; // Message de confirmation
}
