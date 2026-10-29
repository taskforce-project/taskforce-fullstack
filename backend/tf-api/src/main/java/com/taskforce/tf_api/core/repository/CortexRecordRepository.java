package com.taskforce.tf_api.core.repository;

import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.CortexRecord;

@Repository
public interface CortexRecordRepository extends JpaRepository<CortexRecord, UUID> {

    /** Charge un dossier en le verrouillant : deux ajouts ne prennent pas la même place dans la chaîne. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM CortexRecord r WHERE r.id = :id")
    Optional<CortexRecord> findByIdForUpdate(@Param("id") UUID id);

    /** Le dossier d'une personne dans un espace : un autre ne s'ouvre ni ne se prolonge. */
    Optional<CortexRecord> findByIdAndWorkspaceIdAndUserId(UUID id, Long workspaceId, Long userId);
}
