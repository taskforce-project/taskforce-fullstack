package com.taskforce.tf_api.core.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreatePageRequest;
import com.taskforce.tf_api.core.dto.request.UpdatePageRequest;
import com.taskforce.tf_api.core.dto.response.PageResponse;
import com.taskforce.tf_api.core.model.Page;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.PageRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PageService {

    private final PageRepository    pageRepository;
    private final ProjectRepository projectRepository;
    private final UserRepository    userRepository;

    // =========================================================================
    // Queries
    // =========================================================================

    public List<PageResponse> listPages(Long projectId) {
        return pageRepository.findByProjectIdOrderByUpdatedAtDesc(projectId)
            .stream()
            .map(PageResponse::from)
            .toList();
    }

    public PageResponse getPage(Long projectId, Long pageId) {
        Page page = pageRepository.findByIdAndProjectId(pageId, projectId)
            .orElseThrow(() -> new ResourceNotFoundException("Page introuvable"));
        return PageResponse.from(page);
    }

    // =========================================================================
    // Commands
    // =========================================================================

    @Transactional
    public PageResponse createPage(Long projectId, Long userId, CreatePageRequest request) {
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));
        User author = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        Page page = Page.builder()
            .project(project)
            .createdBy(author)
            .title(request.getTitle())
            .emoji(request.getEmoji() != null ? request.getEmoji() : "📄")
            .content(request.getContent())
            .build();

        return PageResponse.from(pageRepository.save(page));
    }

    @Transactional
    public PageResponse updatePage(Long projectId, Long pageId, UpdatePageRequest request) {
        Page page = pageRepository.findByIdAndProjectId(pageId, projectId)
            .orElseThrow(() -> new ResourceNotFoundException("Page introuvable"));

        if (request.getTitle() != null && !request.getTitle().isBlank()) {
            page.setTitle(request.getTitle());
        }
        if (request.getEmoji() != null) {
            page.setEmoji(request.getEmoji());
        }
        if (request.getContent() != null) {
            page.setContent(request.getContent());
        }

        return PageResponse.from(pageRepository.save(page));
    }

    @Transactional
    public void deletePage(Long projectId, Long pageId) {
        Page page = pageRepository.findByIdAndProjectId(pageId, projectId)
            .orElseThrow(() -> new ResourceNotFoundException("Page introuvable"));
        pageRepository.delete(page);
    }
}
