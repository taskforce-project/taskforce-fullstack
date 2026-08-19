package com.taskforce.tf_api.core.model;

import com.taskforce.tf_api.core.enums.DecisionPriorityStatus;
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
 * Une action recommandée par l'IA, actionnable et traçable.
 *
 * <p>{@code issue} porte le lien décision → exécution : quand l'humain accepte la priorité,
 * l'issue créée est rattachée ici. C'est ce qui permet, plus tard, de mesurer si les
 * recommandations du modèle sont suivies (et lesquelles sont systématiquement écartées).
 */
@Entity
@Table(
    name = "decision_priority",
    indexes = { @Index(name = "idx_decision_priority_brief", columnList = "brief_id, position") }
)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DecisionPriority extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "brief_id", nullable = false)
    private DecisionBriefEntity brief;

    /** HIGH | MEDIUM | LOW — aligné sur les priorités d'issue. */
    @Column(nullable = false, length = 8)
    @Builder.Default
    private String level = "MEDIUM";

    @Column(nullable = false, length = 500)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String rationale = "";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private DecisionPriorityStatus status = DecisionPriorityStatus.NEW;

    /** Issue créée à l'acceptation (null tant que la priorité n'est pas acceptée). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_id")
    private Issue issue;

    /** Rang d'affichage (0 = la plus importante). */
    @Column(nullable = false)
    @Builder.Default
    private int position = 0;
}
