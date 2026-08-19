package com.taskforce.tf_api.core.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.IssueSequenceCounter;

@Repository
public interface IssueSequenceCounterRepository extends JpaRepository<IssueSequenceCounter, Long> {

    /** Récupère et verrouille le compteur pour incrémentation atomique */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM IssueSequenceCounter c WHERE c.projectId = :projectId")
    java.util.Optional<IssueSequenceCounter> findByProjectIdForUpdate(@Param("projectId") Long projectId);
}
