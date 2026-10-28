package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

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
 * Une version des règles du harnais d'un espace (spécification de la v2, §6), au format des règles de
 * {@code taskforce-rules/1}. Une version ne se modifie jamais : on en écrit une nouvelle, numérotée à la suite.
 */
@Entity
@Table(name = "harness_rule_sets")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HarnessRuleSet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(name = "version", nullable = false)
    private int version;

    /** Les règles, chacune avec son propriétaire, sa raison et sa date de revue. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "rules", nullable = false, columnDefinition = "jsonb")
    private List<Map<String, Object>> rules;

    /** Qui a écrit cette version ; nul si son compte a été supprimé depuis. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
