package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.IssueChecklistItem;

@Repository
public interface IssueChecklistItemRepository extends JpaRepository<IssueChecklistItem, Long> {

    List<IssueChecklistItem> findByIssueIdOrderByPositionAscIdAsc(Long issueId);

    Optional<IssueChecklistItem> findByIdAndIssueId(Long id, Long issueId);

    long countByIssueId(Long issueId);
}
