package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.SavedChart;

public interface SavedChartRepository extends JpaRepository<SavedChart, Long> {

    List<SavedChart> findByWorkspaceIdOrderByCreatedAtDesc(Long workspaceId);

    Optional<SavedChart> findByIdAndWorkspaceId(Long id, Long workspaceId);
}
