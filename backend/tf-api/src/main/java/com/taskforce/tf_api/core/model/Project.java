package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import com.taskforce.tf_api.core.enums.ProjectStatus;

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
 * Projet appartenant à un workspace.
 * Un projet regroupe des issues, membres et labels.
 * L'identifiant (ex: "WEB") est unique par workspace et sert de préfixe aux issues.
 */
@Entity
@Table(
    name = "projects",
    indexes = {
        @Index(name = "idx_projects_workspace_id", columnList = "workspace_id"),
        @Index(name = "idx_projects_status",       columnList = "status"),
        @Index(name = "idx_projects_created_by",   columnList = "created_by")
    },
    uniqueConstraints = {
        @UniqueConstraint(name = "uq_project_identifier", columnNames = {"workspace_id", "identifier"})
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Project {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Workspace auquel ce projet appartient */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(nullable = false, length = 150)
    private String name;

    /** Identifiant court unique au sein du workspace (ex: "WEB", "API") */
    @Column(nullable = false, length = 10)
    private String identifier;

    @Column(length = 1000)
    private String description;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private ProjectStatus status = ProjectStatus.ACTIVE;

    @Column(name = "is_public", nullable = false)
    @Builder.Default
    private boolean isPublic = false;

    /** URL de l'icône/logo du projet (image uploadée, emoji unicode ou lucide:IconName) */
    @Column(name = "icon_url", columnDefinition = "TEXT")
    private String iconUrl;

    /** Couleur d'accent (classe Tailwind, ex: "bg-violet-500"). Défaut neutre. */
    @Column(nullable = false, length = 50)
    @Builder.Default
    private String color = "bg-primary";

    /** Mode « montée en compétence » : autorise le bonus stretch du Smart Assign (PROD-1.8 Phase 3). */
    @Column(name = "growth_mode", nullable = false)
    @Builder.Default
    private boolean growthMode = false;

    /** Utilisateur ayant créé le projet */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @OneToMany(mappedBy = "project", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ProjectMember> members = new ArrayList<>();

    @OneToMany(mappedBy = "project", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ProjectLabel> labels = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
