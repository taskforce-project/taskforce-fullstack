package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.IssueGitHubLink;

@Repository
public interface IssueGitHubLinkRepository extends JpaRepository<IssueGitHubLink, Long> {

    List<IssueGitHubLink> findByIssueIdOrderByLinkedAtDesc(Long issueId);

    void deleteByIssueId(Long issueId);

    /** Cette pull request est déjà liée à ce ticket. */
    boolean existsByIssueIdAndRepoFullNameAndPrNumber(Long issueId, String repoFullName, Integer prNumber);

    /** Pull requests liées encore ouvertes, les moins récemment relues d'abord (relecture périodique de l'app desktop). */
    @Query("SELECT l FROM IssueGitHubLink l "
        + "WHERE l.linkType = com.taskforce.tf_api.core.enums.GitHubLinkType.PR "
        + "AND l.status = com.taskforce.tf_api.core.enums.GitHubLinkStatus.OPEN AND l.prNumber IS NOT NULL "
        + "ORDER BY l.statusCheckedAt ASC NULLS FIRST, l.id ASC")
    List<IssueGitHubLink> findOpenPullRequests(Pageable page);
}
