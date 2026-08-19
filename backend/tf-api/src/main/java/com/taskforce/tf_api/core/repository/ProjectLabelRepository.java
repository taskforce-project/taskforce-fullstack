package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.ProjectLabel;

@Repository
public interface ProjectLabelRepository extends JpaRepository<ProjectLabel, Long> {

    List<ProjectLabel> findByProjectIdOrderByNameAsc(Long projectId);

    boolean existsByProjectIdAndName(Long projectId, String name);

    void deleteByProjectId(Long projectId);
}
