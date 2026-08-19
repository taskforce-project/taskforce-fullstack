package com.taskforce.tf_api.core.repository;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.MemberLeave;

@Repository
public interface MemberLeaveRepository extends JpaRepository<MemberLeave, Long> {

    List<MemberLeave> findByWorkspaceIdAndUserIdOrderByStartDateDesc(Long workspaceId, Long userId);

    boolean existsByIdAndWorkspaceId(Long id, Long workspaceId);

    /** Détecte un chevauchement de période pour un membre donné (bornes incluses). */
    @Query("""
        SELECT COUNT(l) > 0 FROM MemberLeave l
        WHERE l.workspaceId = :workspaceId
          AND l.userId = :userId
          AND l.startDate <= :endDate
          AND l.endDate >= :startDate
        """)
    boolean existsOverlap(@Param("workspaceId") Long workspaceId,
                          @Param("userId") Long userId,
                          @Param("startDate") LocalDate startDate,
                          @Param("endDate") LocalDate endDate);
}
