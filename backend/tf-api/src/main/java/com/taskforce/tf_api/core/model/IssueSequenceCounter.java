package com.taskforce.tf_api.core.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Compteur de séquence par projet pour la numérotation des issues (ex: WEB-42).
 * Partagé via la clé primaire avec projects.id.
 * Incrémenté de façon atomique dans une transaction.
 */
@Entity
@Table(name = "issue_sequence_counters")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IssueSequenceCounter {

    @Id
    @Column(name = "project_id")
    private Long projectId;

    @OneToOne
    @MapsId
    @JoinColumn(name = "project_id")
    private Project project;

    @Column(name = "last_number", nullable = false)
    @Builder.Default
    private Integer lastNumber = 0;
}
