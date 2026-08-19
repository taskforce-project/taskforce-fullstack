package com.taskforce.tf_api.core.model;

import java.time.LocalDate;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Entrée de temps passé sur une issue (time tracking, BE-ISS-012).
 * Scopé par issue ; {@code user} = qui a loggé le temps.
 */
@Entity
@Table(
    name = "issue_worklogs",
    indexes = {
        @Index(name = "idx_issue_worklogs_issue_id", columnList = "issue_id"),
        @Index(name = "idx_issue_worklogs_user_id",  columnList = "user_id")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IssueWorklog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "issue_id", nullable = false)
    private Long issueId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** Temps passé, en minutes. */
    @Column(nullable = false)
    private int minutes;

    @Column(length = 500)
    private String description;

    /** Date à laquelle le travail a été effectué. */
    @Column(name = "logged_at", nullable = false)
    private LocalDate loggedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
