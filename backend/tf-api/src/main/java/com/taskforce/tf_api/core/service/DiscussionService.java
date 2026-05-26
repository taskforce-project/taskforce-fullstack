package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateDiscussionRequest;
import com.taskforce.tf_api.core.dto.request.UpdateDiscussionRequest;
import com.taskforce.tf_api.core.dto.response.DiscussionResponse;
import com.taskforce.tf_api.core.enums.DiscussionCategory;
import com.taskforce.tf_api.core.model.Discussion;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DiscussionRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DiscussionService {

    private final DiscussionRepository  discussionRepository;
    private final WorkspaceRepository   workspaceRepository;
    private final UserRepository        userRepository;

    // -------------------------------------------------------------------------
    // Read
    // -------------------------------------------------------------------------

    public List<DiscussionResponse> listDiscussions(String slug, DiscussionCategory category) {
        Workspace ws = workspaceRepository.findBySlug(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + slug));

        List<Discussion> discussions = category != null
                ? discussionRepository.findByWorkspaceIdAndCategoryOrderByIsPinnedDescUpdatedAtDesc(ws.getId(), category)
                : discussionRepository.findByWorkspaceIdOrderByIsPinnedDescUpdatedAtDesc(ws.getId());

        return discussions.stream().map(DiscussionResponse::from).collect(Collectors.toList());
    }

    public DiscussionResponse getDiscussion(String slug, Long discussionId) {
        Workspace ws = workspaceRepository.findBySlug(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + slug));
        Discussion discussion = discussionRepository.findByIdAndWorkspaceId(discussionId, ws.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found: " + discussionId));
        return DiscussionResponse.from(discussion);
    }

    // -------------------------------------------------------------------------
    // Write
    // -------------------------------------------------------------------------

    @Transactional
    public DiscussionResponse createDiscussion(String slug, Long authorId, CreateDiscussionRequest req) {
        Workspace ws = workspaceRepository.findBySlug(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + slug));
        User author = userRepository.findById(authorId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + authorId));

        String tagsStr = req.getTags() != null
                ? String.join(",", req.getTags())
                : null;

        Discussion discussion = Discussion.builder()
                .workspace(ws)
                .author(author)
                .title(req.getTitle().trim())
                .body(req.getBody())
                .category(req.getCategory() != null ? req.getCategory() : DiscussionCategory.GENERAL)
                .tags(tagsStr)
                .build();

        return DiscussionResponse.from(discussionRepository.save(discussion));
    }

    @Transactional
    public DiscussionResponse updateDiscussion(String slug, Long discussionId, UpdateDiscussionRequest req) {
        Workspace ws = workspaceRepository.findBySlug(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + slug));
        Discussion discussion = discussionRepository.findByIdAndWorkspaceId(discussionId, ws.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found: " + discussionId));

        if (req.getTitle() != null)    discussion.setTitle(req.getTitle().trim());
        if (req.getBody() != null)     discussion.setBody(req.getBody());
        if (req.getCategory() != null) discussion.setCategory(req.getCategory());
        if (req.getState() != null)    discussion.setState(req.getState());
        if (req.getTags() != null)     discussion.setTags(String.join(",", req.getTags()));

        return DiscussionResponse.from(discussionRepository.save(discussion));
    }

    @Transactional
    public void deleteDiscussion(String slug, Long discussionId) {
        Workspace ws = workspaceRepository.findBySlug(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + slug));
        Discussion discussion = discussionRepository.findByIdAndWorkspaceId(discussionId, ws.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found: " + discussionId));
        discussionRepository.delete(discussion);
    }

    @Transactional
    public DiscussionResponse togglePin(String slug, Long discussionId) {
        Workspace ws = workspaceRepository.findBySlug(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + slug));
        Discussion discussion = discussionRepository.findByIdAndWorkspaceId(discussionId, ws.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found: " + discussionId));
        discussion.setIsPinned(!Boolean.TRUE.equals(discussion.getIsPinned()));
        return DiscussionResponse.from(discussionRepository.save(discussion));
    }

    @Transactional
    public DiscussionResponse toggleLock(String slug, Long discussionId) {
        Workspace ws = workspaceRepository.findBySlug(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + slug));
        Discussion discussion = discussionRepository.findByIdAndWorkspaceId(discussionId, ws.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found: " + discussionId));
        discussion.setIsLocked(!Boolean.TRUE.equals(discussion.getIsLocked()));
        return DiscussionResponse.from(discussionRepository.save(discussion));
    }
}
