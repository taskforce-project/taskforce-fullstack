package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.model.DeliveryRunChange;

/** Les fichiers changés par une mission (R139). */
public interface DeliveryRunChangeRepository extends JpaRepository<DeliveryRunChange, Long> {

    /** Un fichier de la mission, sans son texte : la liste se relit toutes les deux secondes pendant le travail. */
    record Row(Long id, String path, String status, Integer added, Integer removed, boolean binary, boolean truncated,
               boolean withheld, String revision, LocalDateTime updatedAt) {}

    @Query("""
        SELECT new com.taskforce.tf_api.core.repository.DeliveryRunChangeRepository$Row(
            c.id, c.path, c.status, c.added, c.removed, c.binary, c.truncated, c.withheld, c.revision, c.updatedAt)
        FROM DeliveryRunChange c WHERE c.run.id = :runId ORDER BY c.path ASC
        """)
    List<Row> listRows(@Param("runId") Long runId);

    Optional<DeliveryRunChange> findByRunIdAndPath(Long runId, String path);

    boolean existsByRunIdAndPath(Long runId, String path);

    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM DeliveryRunChange c WHERE c.run.id = :runId AND c.path IN :paths")
    int deleteByRunIdAndPathIn(@Param("runId") Long runId, @Param("paths") Collection<String> paths);
}
