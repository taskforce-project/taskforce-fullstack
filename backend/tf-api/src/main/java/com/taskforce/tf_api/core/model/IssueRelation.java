package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import com.taskforce.tf_api.core.enums.IssueRelationType;

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
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Relation directionnelle entre deux issues.
 * Ex : issue A BLOCKS issue B, issue A DUPLICATE of issue B.
 *
 * La contrainte unique empêche deux relations identiques (même source, même cible, même type).
 */
@Entity
@Table(
    name = "issue_relations",
    indexes = {
        @Index(name = "idx_issue_relations_source_id", columnList = "source_id"),
        @Index(name = "idx_issue_relations_target_id", columnList = "target_id")
    },
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_issue_relation",
            columnNames = {"source_id", "target_id", "relation_type"}
        )
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IssueRelation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_id", nullable = false)
    private Issue source;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_id", nullable = false)
    private Issue target;

    @Enumerated(EnumType.STRING)
    @Column(name = "relation_type", nullable = false, length = 20)
    private IssueRelationType relationType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
