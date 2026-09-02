package com.taskforce.tf_api.core.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.enums.AiGenerationKind;
import com.taskforce.tf_api.core.model.AiGeneration;

/**
 * Acces au corpus {@code ai_generations} (data flywheel). Ecritures best-effort via
 * {@code AiGenerationService} ; pas de lecture exposee au public dans ce lot.
 */
public interface AiGenerationRepository extends JpaRepository<AiGeneration, Long> {

    /**
     * Derniere ligne OUVERTE (final non renseigne) d'un objet, pour la finaliser a la decision
     * humaine (ex. le draft de spec ecrit a la generation, finalise a l'approbation).
     */
    Optional<AiGeneration> findFirstByWorkspaceIdAndKindAndRequestRefAndFinalValueIsNullOrderByCreatedAtDesc(
        Long workspaceId, AiGenerationKind kind, String requestRef);

    /** Purge RGPD : efface tout le corpus d'un workspace. */
    long deleteByWorkspaceId(Long workspaceId);

    long countByWorkspaceIdAndKind(Long workspaceId, AiGenerationKind kind);
}
