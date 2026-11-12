package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * La signature d'une personne sur un accord qu'une règle de l'entreprise demande (R98, V125) : elle accorde ou refuse,
 * une fois. L'accord est donné quand les signatures réunissent ce qu'il demande, refusé dès qu'une personne refuse.
 */
@Entity
@Table(name = "delivery_run_approval_signatures")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeliveryRunApprovalSignature {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "approval_id", nullable = false)
    private DeliveryRunApproval approval;

    /** Qui a signé ; nul si son compte a été supprimé depuis. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "allow", nullable = false)
    private boolean allow;

    @Column(name = "signed_at", nullable = false)
    private LocalDateTime signedAt;
}
