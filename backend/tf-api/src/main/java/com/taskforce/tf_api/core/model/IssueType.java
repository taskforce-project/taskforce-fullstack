package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

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
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Type d'issue configurable par projet.
 * Ex : Bug, Feature, Task, Improvement, Sub-task.
 */
@Entity
@Table(
    name = "issue_types",
    indexes = {
        @Index(name = "idx_issue_types_project_id", columnList = "project_id")
    },
    uniqueConstraints = {
        @UniqueConstraint(name = "uq_issue_type_name", columnNames = {"project_id", "name"})
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IssueType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(nullable = false, length = 30)
    @Builder.Default
    private String color = "#6366f1";

    /** Nom d'icône Lucide (ex: "bug", "circle-dot", "zap") */
    @Column(nullable = false, length = 50)
    @Builder.Default
    private String icon = "circle-dot";

    @Column(name = "is_default", nullable = false)
    @Builder.Default
    private boolean isDefault = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
