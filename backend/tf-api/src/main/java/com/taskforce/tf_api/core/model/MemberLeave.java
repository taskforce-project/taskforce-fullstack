package com.taskforce.tf_api.core.model;

import java.time.LocalDate;

import com.taskforce.tf_api.core.enums.LeaveType;
import com.taskforce.tf_api.shared.audit.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Enumerated;
import jakarta.persistence.EnumType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Indisponibilité d'un membre (congés, maladie, télétravail…) — US-006.
 * Scopée par workspace ; {@code userId} = membre concerné.
 */
@Entity
@Table(
    name = "member_leaves",
    indexes = {
        @Index(name = "idx_member_leaves_workspace_user",  columnList = "workspace_id, user_id"),
        @Index(name = "idx_member_leaves_workspace_dates", columnList = "workspace_id, start_date, end_date")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberLeave extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id", nullable = false)
    private Long workspaceId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private LeaveType type;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(columnDefinition = "TEXT")
    private String note;
}
