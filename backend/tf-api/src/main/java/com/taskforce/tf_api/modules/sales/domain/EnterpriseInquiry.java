package com.taskforce.tf_api.modules.sales.domain;

import com.taskforce.tf_api.shared.audit.AuditableEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Entité représentant une demande de contact ENTERPRISE.
 * Séparée du flow d'inscription pour une gestion indépendante.
 */
@Entity
@Table(name = "enterprise_inquiries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EnterpriseInquiry extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "email", nullable = false)
    private String email;

    @Column(name = "team_size", nullable = false, length = 50)
    private String teamSize; // "1-10", "11-50", "51-200", "200+"

    @Column(name = "message", columnDefinition = "TEXT")
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 50)
    @Builder.Default
    private InquiryStatus status = InquiryStatus.NEW;

    @Column(name = "created_account")
    @Builder.Default
    private Boolean createdAccount = false;

    @Column(name = "user_id")
    private Long userId; // Si l'utilisateur a créé un compte FREE en attendant

    @Column(name = "assigned_to", length = 100)
    private String assignedTo; // ID ou email du commercial

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes; // Notes internes de l'équipe sales

    @Column(name = "contacted_at")
    private LocalDateTime contactedAt;

    @Column(name = "converted_at")
    private LocalDateTime convertedAt;

    public enum InquiryStatus {
        NEW,        // Nouvelle demande
        CONTACTED,  // Contacté par l'équipe sales
        QUALIFIED,  // Lead qualifié (budget, besoin, autorité, timing)
        CONVERTED,  // Converti en client ENTERPRISE
        REJECTED    // Lead non qualifié ou perdu
    }
}
