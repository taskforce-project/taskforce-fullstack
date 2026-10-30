package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.DeliveryRunOutcome;
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

    /** Clé du provider délégué ("claude-code"). */
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

    /**
     * Mission refusée au départ par une règle (par exemple sur un dépôt public) : FAILED pour la file, « Not started » à
     * l'écran, car ce n'est pas une panne (recette du 29/10/2026, R38).
     */
    @Column(nullable = false)
    @Builder.Default
    private boolean refused = false;

    /** Qui a lancé la délégation (null si compte supprimé depuis). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "started_by")
    private User startedBy;

    /** Runner local qui a réclamé le run : client Keycloak du compte de service (ADR-013), sinon null. */
    @Column(name = "claimed_by", length = 120)
    private String claimedBy;

    /** Début de la session déléguée du runner (borne sa durée de vie). */
    @Column(name = "claimed_at")
    private LocalDateTime claimedAt;

    /** Dernier signe de vie du runner : muet trop longtemps, le run passe en échec. */
    @Column(name = "heartbeat_at")
    private LocalDateTime heartbeatAt;

    /** Version du paquet de règles remis au runner à la réclamation (spécification de la v2, §6.4). */
    @Column(name = "rules_version")
    private Integer rulesVersion;

    /** Empreinte de ce paquet : ce qui a été appliqué, pour le dossier de preuve. */
    @Column(name = "rules_digest", length = 71)
    private String rulesDigest;

    /** Empreinte du dernier événement du dossier de preuve, posée à la fin de la mission : elle scelle le dossier. */
    @Column(name = "evidence_root", length = 71)
    private String evidenceRoot;

    // --- Ce que le runner rapporte de la mission, pour la carte de résultat (R78) : des faits, pas le résumé de l'agent.

    /** La branche de l'agent, et ses commits. */
    @Column(length = 255)
    private String branch;

    private Integer commits;

    /** Les tests du projet, lancés par le runner après l'agent (R32) : la commande, lancés ou non, passés ou non. */
    @Column(name = "tests_command", length = 500)
    private String testsCommand;

    @Column(name = "tests_ran")
    private Boolean testsRan;

    @Column(name = "tests_passed")
    private Boolean testsPassed;

    /** Combien ont passé, sur combien, quand leur sortie le dit. */
    @Column(name = "tests_passed_count")
    private Integer testsPassedCount;

    @Column(name = "tests_total")
    private Integer testsTotal;

    /** La fin de la mission, réussie ou non. */
    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    /** Le geste de la personne sur la carte de résultat, qui et quand ; vide tant qu'elle n'a pas tranché. */
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private DeliveryRunOutcome outcome;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "outcome_by")
    private User outcomeBy;

    @Column(name = "outcome_at")
    private LocalDateTime outcomeAt;
}
