package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.IssueWorklog;

@Repository
public interface IssueWorklogRepository extends JpaRepository<IssueWorklog, Long> {

    List<IssueWorklog> findByIssueIdOrderByLoggedAtDescIdDesc(Long issueId);

    Optional<IssueWorklog> findByIdAndIssueId(Long id, Long issueId);

    /** Tous les worklogs saisis par un utilisateur (export RGPD — portabilité). */
    List<IssueWorklog> findByUser_IdOrderByLoggedAtDescIdDesc(Long userId);

    @Query("SELECT COALESCE(SUM(w.minutes), 0) FROM IssueWorklog w WHERE w.issueId = :issueId")
    long sumMinutesByIssueId(@Param("issueId") Long issueId);
}
