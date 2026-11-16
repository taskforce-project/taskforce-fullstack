package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.model.ProcessVersion;

public interface ProcessVersionRepository extends JpaRepository<ProcessVersion, Long> {

    /** Une version, sans son modèle : ce que montrent les listes. */
    interface Row {
        Long getDefinitionId();

        int getVersion();

        String getName();

        String getDigest();

        Long getAuthorId();

        LocalDateTime getCreatedAt();
    }

    /** La version en vigueur d'une définition : la dernière publiée. */
    Optional<ProcessVersion> findFirstByDefinitionIdOrderByVersionDesc(Long definitionId);

    Optional<ProcessVersion> findByDefinitionIdAndVersion(Long definitionId, int version);

    /** Toutes les versions des processus d'un projet, sans leur modèle, la plus récente d'abord. */
    @Query("""
        select v.definition.id as definitionId, v.version as version, v.name as name, v.digest as digest,
               u.id as authorId, v.createdAt as createdAt
        from ProcessVersion v left join v.createdBy u
        where v.definition.project.id = :projectId
        order by v.version desc""")
    List<Row> listRows(@Param("projectId") Long projectId);
}
