package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.IssueGitHubLink;

@Repository
public interface IssueGitHubLinkRepository extends JpaRepository<IssueGitHubLink, Long> {

    List<IssueGitHubLink> findByIssueIdOrderByLinkedAtDesc(Long issueId);

    void deleteByIssueId(Long issueId);
}
