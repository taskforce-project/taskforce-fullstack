package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.IssueStatus;

@Repository
public interface IssueStatusRepository extends JpaRepository<IssueStatus, Long> {

    List<IssueStatus> findByProjectIdOrderByPosition(Long projectId);

    Optional<IssueStatus> findByProjectIdAndIsDefaultTrue(Long projectId);

    boolean existsByProjectIdAndName(Long projectId, String name);

    @Query("SELECT s FROM IssueStatus s WHERE s.project.id = :projectId AND s.category = :category ORDER BY s.position")
    List<IssueStatus> findByProjectIdAndCategory(
        @Param("projectId") Long projectId,
        @Param("category") IssueStatusCategory category
    );
}
