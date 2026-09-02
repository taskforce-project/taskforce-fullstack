package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

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
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Workspace — espace de travail d'une équipe.
 * Créé automatiquement lors de l'inscription de chaque utilisateur.
 */
@Entity
@Table(
    name = "workspaces",
    indexes = {
        @Index(name = "idx_workspaces_owner_id", columnList = "owner_id"),
        @Index(name = "idx_workspaces_slug",     columnList = "slug", unique = true)
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Workspace {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** UUID stable pour l'identification externe (ne change jamais) */
    @Column(name = "uuid", nullable = false, unique = true, columnDefinition = "uuid")
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    @Column(nullable = false, length = 100)
    private String name;

    /** Identifiant URL-friendly unique */
    @Column(nullable = false, unique = true, length = 100)
    private String slug;

    @Column(length = 500)
    private String description;

    @Column(name = "logo_url", length = 1000)
    private String logoUrl;

    /**
     * Opt-in RGPD : capture du corpus d'apprentissage IA ({@code ai_generations}) pour ce workspace.
     * Defaut OFF - rien n'est capture tant que le workspace ne l'active pas (data flywheel).
     */
    @Column(name = "ai_learning_enabled", nullable = false)
    @Builder.Default
    private boolean aiLearningEnabled = false;

    /** Propriétaire du workspace */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @OneToMany(mappedBy = "workspace", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<WorkspaceMember> members = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
