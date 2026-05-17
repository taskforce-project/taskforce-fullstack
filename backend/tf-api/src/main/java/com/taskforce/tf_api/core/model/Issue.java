package com.taskforce.tf_api.core.model;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import com.taskforce.tf_api.core.enums.IssuePriority;

import jakarta.persistence.CascadeType;
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
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Issue appartenant à un projet.
 * Identifiée par project.identifier + sequence_number (ex: WEB-42).
 */
@Entity
@Table(
    name = "issues",
    indexes = {
        @Index(name = "idx_issues_project_id",  columnList = "project_id"),
        @Index(name = "idx_issues_status_id",   columnList = "status_id"),
        @Index(name = "idx_issues_type_id",     columnList = "type_id"),
        @Index(name = "idx_issues_assignee_id", columnList = "assignee_id"),
        @Index(name = "idx_issues_reporter_id", columnList = "reporter_id"),
        @Index(name = "idx_issues_parent_id",   columnList = "parent_id"),
        @Index(name = "idx_issues_priority",    columnList = "priority"),
        @Index(name = "idx_issues_due_date",    columnList = "due_date"),
        @Index(name = "idx_issues_created_at",  columnList = "created_at")
    },
    uniqueConstraints = {
        @UniqueConstraint(name = "uq_issue_sequence", columnNames = {"project_id", "sequence_number"})
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Issue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "sequence_number", nullable = false)
    private Integer sequenceNumber;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(nullable = false)
    @Builder.Default
    private IssuePriority priority = IssuePriority.NONE;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "status_id", nullable = false)
    private IssueStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "type_id")
    private IssueType type;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_id")
    private User assignee;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reporter_id", nullable = false)
    private User reporter;

    /** Issue parente — null si issue de premier niveau */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Issue parent;

    /** Sous-issues directes */
    @OneToMany(mappedBy = "parent", fetch = FetchType.LAZY)
    @Builder.Default
    private List<Issue> children = new ArrayList<>();

    /** Position d'affichage dans la colonne kanban (0-based, croissant) */
    @Column(nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "due_date")
    private LocalDate dueDate;

    /** Renseigné quand le statut passe en catégorie COMPLETED */
    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "issue_label_assignments",
        joinColumns        = @JoinColumn(name = "issue_id"),
        inverseJoinColumns = @JoinColumn(name = "label_id")
    )
    @Builder.Default
    private List<ProjectLabel> labels = new ArrayList<>();

    @OneToMany(mappedBy = "issue", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<IssueComment> comments = new ArrayList<>();

    @OneToMany(mappedBy = "issue", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<IssueActivity> activities = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
