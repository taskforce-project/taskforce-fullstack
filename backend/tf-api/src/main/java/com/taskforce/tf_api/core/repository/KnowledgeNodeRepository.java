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

    long countByWorkspaceId(Long workspaceId);
}
