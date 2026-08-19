package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.model.ProjectFavorite;

public interface ProjectFavoriteRepository extends JpaRepository<ProjectFavorite, Long> {

    boolean existsByUserIdAndProjectId(Long userId, Long projectId);

    void deleteByUserIdAndProjectId(Long userId, Long projectId);

    @Query("SELECT pf.projectId FROM ProjectFavorite pf WHERE pf.userId = :userId")
    List<Long> findProjectIdsByUserId(@Param("userId") Long userId);
}
