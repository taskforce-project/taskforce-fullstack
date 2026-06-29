package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.enums.NodeStatus;
import com.taskforce.tf_api.core.model.KnowledgeNode;

@Repository
public interface KnowledgeNodeRepository extends JpaRepository<KnowledgeNode, Long> {

    List<KnowledgeNode> findByWorkspaceIdOrderByDomainAscTitleAsc(Long workspaceId);

    List<KnowledgeNode> findByWorkspaceIdAndStatusOrderByDomainAscTitleAsc(Long workspaceId, NodeStatus status);

    List<KnowledgeNode> findByWorkspaceIdAndDomainOrderByTitleAsc(Long workspaceId, NodeDomain domain);

    Optional<KnowledgeNode> findByIdAndWorkspaceId(Long id, Long workspaceId);

    /** Résolution d'un [[wikilink]] : 1er node du workspace au titre donné (insensible à la casse). */
    Optional<KnowledgeNode> findFirstByWorkspaceIdAndTitleIgnoreCase(Long workspaceId, String title);

    long countByWorkspaceId(Long workspaceId);

    /** Purge tous les nodes d'un workspace (re-seed). Les arêtes tombent par cascade FK. */
    void deleteByWorkspaceId(Long workspaceId);
}
