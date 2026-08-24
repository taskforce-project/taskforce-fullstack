package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO de réponse pour un workspace
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkspaceResponse {

    private Long id;
    private String uuid;
    private String name;
    private String slug;
    private String description;
    private String logoUrl;

    /** Résumé du propriétaire */
    private Long ownerId;
    private String ownerName;

    /**
     * Vrai si l'utilisateur qui demande la liste est le propriétaire (espace « perso »), faux s'il y
     * est seulement membre (espace « partagé », façon orgs GitHub). Renseigné par
     * {@code listWorkspacesByUser} ; défaut false pour les réponses hors contexte utilisateur.
     */
    private boolean personal;

    /** Nombre de membres */
    private int memberCount;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
