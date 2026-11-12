package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;
import java.util.List;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.taskforce.tf_api.core.enums.DeliveryApprovalStatus;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
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

    /** L'action jugée par les règles ({@code web.search}, {@code shell}, {@code git.push}...), vide si le runner ne l'a pas dite. */
    @Column(length = 40)
    private String action;

    /** La règle qui demande, et sa raison telle qu'elle s'écrit pour la personne (R78) ; vides quand aucune ne couvre l'action. */
    @Column(name = "rule_id", length = 120)
    private String ruleId;

    @Column(name = "rule_reason", length = 500)
    private String ruleReason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private DeliveryApprovalStatus status = DeliveryApprovalStatus.PENDING;

    /** Portée d'un accord : {@code ONCE}, ou {@code MISSION} pour le reste de la mission (R46) ; vide tant qu'on n'a pas répondu. */
    @Column(length = 16)
    private String scope;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "decided_by")
    private User decidedBy;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    /**
     * Ce qu'une règle de l'entreprise demande à cet accord (R98, V125) : les listes de personnes désignées
     * ({@code person:<id>}, {@code role:admin}...), une personne de chaque liste ; nul pour un accord ordinaire, que la
     * personne qui a délégué donne seule.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "approvers", columnDefinition = "jsonb")
    private List<List<String>> approvers;

    /** Le nombre de personnes distinctes qui accordent. */
    @Column(name = "signatures", nullable = false)
    @Builder.Default
    private int signatures = 1;

    /** La personne qui a délégué ne signe pas (la séparation de qui prépare et de qui signe). */
    @Column(name = "separate_roles", nullable = false)
    @Builder.Default
    private boolean separateRoles = false;

    /** Les obligations de l'accord, telles que le moteur les a rendues ; nulles pour un accord ordinaire. */
    public RulesEngine.Obligations obligations() {
        if ((approvers == null || approvers.isEmpty()) && signatures <= 1 && !separateRoles) {
            return null;
        }
        return new RulesEngine.Obligations(approvers == null ? List.of() : approvers, Math.max(1, signatures), separateRoles);
    }
}
