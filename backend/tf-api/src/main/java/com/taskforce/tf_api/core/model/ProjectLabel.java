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
 * Label rattaché à un projet, utilisable sur ses issues.
 */
@Entity
@Table(
    name = "project_labels",
    indexes = {
        @Index(name = "idx_project_labels_project_id", columnList = "project_id")
    },
    uniqueConstraints = {
        @UniqueConstraint(name = "uq_project_label_name", columnNames = {"project_id", "name"})
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectLabel {

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

    @Column(length = 200)
    private String description;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // equals/hashCode par id — REQUIS pour un usage correct dans un Set<ProjectLabel>
    // (cf. Issue#labels @ManyToMany). Sans ça (égalité par identité), Hibernate ne
    // reconnaissait pas un label déjà présent et ré-insérait sa ligne quand on en ajoutait
    // un autre → duplicate key sur issue_label_assignments_pkey (ISS-06).
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ProjectLabel that)) return false;
        return id != null && id.equals(that.id);
    }

    @Override
    public int hashCode() {
        // Constante : hashCode stable même quand l'id est null (label transient),
        // condition d'un usage sûr dans un Set avant/après persistance.
        return getClass().hashCode();
    }
}
