package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.model.AnalysisJob;

public interface AnalysisJobRepository extends JpaRepository<AnalysisJob, Long> {

    /** Workflows visibles dans le dock, du plus récent au plus ancien (les masqués sont exclus). */
    @Query("""
        SELECT j FROM AnalysisJob j
        WHERE j.workspace.id = :workspaceId AND j.dismissed = false
        ORDER BY j.createdAt DESC
        """)
    List<AnalysisJob> findVisibleByWorkspaceId(@Param("workspaceId") Long workspaceId);

    /** Charge un workflow en s'assurant qu'il appartient bien au workspace (autorisation). */
    Optional<AnalysisJob> findByIdAndWorkspaceId(Long id, Long workspaceId);
}
