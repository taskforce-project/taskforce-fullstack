package com.taskforce.tf_api.core.model;

import java.util.HashMap;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

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
 * Une carte de dashboard épinglée par un UTILISATEUR dans un WORKSPACE. On stocke le type (clé du
 * registre front), le titre personnalisé, la <b>config</b> (JSON libre : taille, spec de graphe IA…)
 * et la position d'affichage — jamais de données calculées, recalculées à l'affichage.
 */
@Entity
@Table(
    name = "dashboard_cards",
    indexes = { @Index(name = "idx_dashboard_cards_workspace_user", columnList = "workspace_id, user_id") }
)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardCard extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    /** Propriétaire de la carte : seule cette personne la voit et la modifie. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** Clé du registre front (ex. "ops-health", "throughput", "ai-chart"). */
    @Column(name = "card_type", nullable = false, length = 40)
    private String cardType;

    /** Titre personnalisé (null = titre par défaut du registre). */
    @Column(length = 200)
    private String title;

    /** Config libre côté front (size, spec IA…). Jamais de données. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "config", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> config = new HashMap<>();

    /** Période d'affichage (ex. "30d"). */
    @Column(name = "time_range", length = 10)
    private String timeRange;

    /** Ordre d'affichage dans le dashboard (0-based, croissant). */
    @Column(nullable = false)
    @Builder.Default
    private Integer position = 0;
}
