package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.IssueActivity;

@Repository
public interface IssueActivityRepository extends JpaRepository<IssueActivity, Long> {

    List<IssueActivity> findByIssueIdOrderByCreatedAtAsc(Long issueId);
}
