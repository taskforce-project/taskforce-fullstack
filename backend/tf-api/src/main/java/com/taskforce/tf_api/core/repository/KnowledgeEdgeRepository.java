package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.KnowledgeEdge;

@Repository
public interface KnowledgeEdgeRepository extends JpaRepository<KnowledgeEdge, Long> {

    List<KnowledgeEdge> findByWorkspaceId(Long workspaceId);

    /** Toutes les arêtes touchant un node (entrantes ou sortantes). */
    @Query("SELECT e FROM KnowledgeEdge e WHERE e.fromNode.id = :nodeId OR e.toNode.id = :nodeId")
    List<KnowledgeEdge> findTouchingNode(@Param("nodeId") Long nodeId);

    boolean existsByFromNodeIdAndToNodeIdAndRelationType(
        Long fromNodeId, Long toNodeId, com.taskforce.tf_api.core.enums.EdgeRelation relationType);
}
