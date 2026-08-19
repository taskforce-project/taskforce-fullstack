package com.taskforce.tf_api.core.model;

import java.util.ArrayList;
import java.util.List;

import com.taskforce.tf_api.shared.audit.AuditableEntity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * La « décision du jour » d'un projet, persistée — produit d'un {@link AnalysisJob}.
 *
 * <p>Nommée {@code …Entity} pour ne pas entrer en collision avec le DTO
 * {@code core.dto.response.DecisionBrief}, qui reste le contrat de l'endpoint synchrone existant.
 *
 * <p>Les {@code snapshot*} figent les métriques observées au moment de l'analyse : on sait
 * toujours sur quels chiffres le modèle a raisonné, même si le projet a bougé depuis.
 * {@code risks} est sérialisé en JSON (colonne TEXT) — pas de table pour une simple liste de phrases.
 */
@Entity
@Table(
    name = "decision_brief",
    indexes = { @Index(name = "idx_decision_brief_project", columnList = "project_id") }
)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DecisionBriefEntity extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String situation = "";

    /** Array JSON de strings (sérialisé par le service). */
    @Column(name = "risks_json", nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String risksJson = "[]";

    @Column(name = "snapshot_total",       nullable = false) @Builder.Default private long snapshotTotal = 0;
    @Column(name = "snapshot_open",        nullable = false) @Builder.Default private long snapshotOpen = 0;
    @Column(name = "snapshot_in_progress", nullable = false) @Builder.Default private long snapshotInProgress = 0;
    @Column(name = "snapshot_completed",   nullable = false) @Builder.Default private long snapshotCompleted = 0;
    @Column(name = "snapshot_overdue",     nullable = false) @Builder.Default private long snapshotOverdue = 0;
    @Column(name = "snapshot_due_soon",    nullable = false) @Builder.Default private long snapshotDueSoon = 0;

    /** {@code generated} (LLM) ou {@code fallback} (repli déterministe). */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String mode = "generated";

    @OneToMany(mappedBy = "brief", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("position ASC")
    @Builder.Default
    private List<DecisionPriority> priorities = new ArrayList<>();

    /** Rattache une priorité en maintenant les deux côtés de la relation. */
    public void addPriority(DecisionPriority priority) {
        priority.setBrief(this);
        priorities.add(priority);
    }
}
