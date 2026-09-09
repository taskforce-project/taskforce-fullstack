package com.taskforce.tf_api.core.model;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.shared.audit.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Run de délégation d'une tâche (issue) à un agent de livraison (TF-AGENT-DELIVERY slice 3).
 *
 * <p>Trace durable : quel provider, quel modèle, l'état ({@link DeliveryRunStatus}) et le résultat
 * (résumé + lien PR/doc). Le pipeline {@code dispatch -> poll -> résultat} est exécuté en arrière-plan
 * (patron {@code AnalysisJobRunner}). La décision d'accepter le résultat reste humaine (1 clic).</p>
 */
@Entity
@Table(
    name = "delivery_runs",
    indexes = { @Index(name = "idx_delivery_runs_issue", columnList = "issue_id") }
)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeliveryRun extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "issue_id", nullable = false)
    private Issue issue;

    /** Clé du provider délégué ("claude-code", "stub"...). */
    @Column(name = "provider_key", nullable = false, length = 40)
    private String providerKey;

    /** Modèle utilisé (indicatif). */
    @Column(length = 80)
    private String model;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private DeliveryRunStatus status = DeliveryRunStatus.QUEUED;

    /** Identifiant du run côté provider (rempli au dispatch). */
    @Column(name = "external_ref", length = 200)
    private String externalRef;

    /** Résumé produit (non null quand DONE). */
    @Column(columnDefinition = "TEXT")
    private String summary;

    /** Lien du résultat selon la tâche : PR, doc, ... (non null quand DONE). */
    @Column(name = "result_url", length = 1000)
    private String resultUrl;

    /** Message d'échec (non null quand FAILED). */
    @Column(columnDefinition = "TEXT")
    private String error;

    /** Qui a lancé la délégation (null si compte supprimé depuis). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "started_by")
    private User startedBy;
}
