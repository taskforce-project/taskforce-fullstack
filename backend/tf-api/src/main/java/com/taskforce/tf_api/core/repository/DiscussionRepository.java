package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.DiscussionCategory;
import com.taskforce.tf_api.core.model.Discussion;

@Repository
public interface DiscussionRepository extends JpaRepository<Discussion, Long> {

    List<Discussion> findByWorkspaceIdOrderByIsPinnedDescUpdatedAtDesc(Long workspaceId);

    List<Discussion> findByWorkspaceIdAndCategoryOrderByIsPinnedDescUpdatedAtDesc(
            Long workspaceId, DiscussionCategory category);

    Optional<Discussion> findByIdAndWorkspaceId(Long id, Long workspaceId);

    boolean existsByIdAndWorkspaceId(Long id, Long workspaceId);
}
