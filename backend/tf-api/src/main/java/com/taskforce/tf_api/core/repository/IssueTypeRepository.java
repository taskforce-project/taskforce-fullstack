package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.IssueType;

@Repository
public interface IssueTypeRepository extends JpaRepository<IssueType, Long> {

    List<IssueType> findByProjectIdOrderByName(Long projectId);

    boolean existsByProjectIdAndName(Long projectId, String name);

    java.util.Optional<IssueType> findByProjectIdAndIsDefaultTrue(Long projectId);
}
