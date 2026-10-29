package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.DeliveryApprovalStatus;
import com.taskforce.tf_api.shared.audit.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Demande de validation d'une action de l'agent (OSS-5.4) : l'outil, ce qu'il ferait, et la décision de la personne
 * qui a délégué. Le runner la lit jusqu'à décision ou expiration ; tout ce qui n'est pas {@code ALLOWED} est un refus.
 */
@Entity
@Table(name = "delivery_run_approvals")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeliveryRunApproval extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private DeliveryRun run;

    @Column(nullable = false, length = 120)
    private String tool;

    /** Ce que l'action ferait (commande, fichier, adresse), tel que le runner l'a résumé. */
    @Column(nullable = false, length = 2000)
    private String summary;

    /** Qui demande : {@code agent} (une action de l'agent) ou {@code runner} (TaskForce lui-même : sortie, tests, départ). */
    @Column(name = "asked_by", nullable = false, length = 16)
    @Builder.Default
    private String askedBy = "agent";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private DeliveryApprovalStatus status = DeliveryApprovalStatus.PENDING;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "decided_by")
    private User decidedBy;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;
}
