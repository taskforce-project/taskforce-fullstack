package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Le dossier d'une réponse de Cortex qui a appelé un outil (V107) : la mission de l'agent interne, au format des
 * missions (contracts/evidence). Ses événements sont dans {@link CortexRecordEvent} ; {@code root} est l'empreinte du
 * dernier, tenue à jour à chaque ajout.
 */
@Entity
@Table(name = "cortex_records")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CortexRecord {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false, updatable = false)
    private Long workspaceId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private Long userId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(length = 71)
    private String root;
}
