package com.taskforce.tf_api.core.model;

import com.taskforce.tf_api.shared.audit.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * Un graphe épinglé (« Custom ») d'un workspace. On stocke sa <b>spec</b> (le JSON {@code ChartSpec})
 * — jamais les données, qui sont recalculées à l'affichage depuis les vraies sources. Portée
 * workspace : visible par tous les membres.
 */
@Entity
@Table(
    name = "saved_chart",
    indexes = { @Index(name = "idx_saved_chart_workspace", columnList = "workspace_id") }
)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SavedChart extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(nullable = false, length = 200)
    private String title;

    /** {@code ChartSpec} sérialisé (mode + dataset/série ou dimension/mesure). Jamais de données. */
    @Column(name = "spec_json", nullable = false, columnDefinition = "TEXT")
    private String specJson;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id")
    private User createdByUser;
}
