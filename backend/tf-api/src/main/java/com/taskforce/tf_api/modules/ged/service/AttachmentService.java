package com.taskforce.tf_api.modules.ged.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.modules.ged.domain.Attachment;
import com.taskforce.tf_api.modules.ged.dto.response.AttachmentResponse;
import com.taskforce.tf_api.modules.ged.repository.AttachmentRepository;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AttachmentService {

    private static final long MAX_FILE_SIZE = 25 * 1024 * 1024L; // 25 MB

    private final AttachmentRepository attachmentRepository;
    private final IssueRepository issueRepository;
    private final UserRepository userRepository;
    private final MinioService minioService;

    @Transactional
    public AttachmentResponse upload(String slug, Long projectId, Long issueId, MultipartFile file, Long userId) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("File is empty");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException("File exceeds 25 MB limit");
        }

        Issue issue = findScopedIssue(slug, projectId, issueId);

        User uploader = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));

        String rawOriginalName = file.getOriginalFilename();
        String originalName = rawOriginalName != null && !rawOriginalName.isBlank() ? rawOriginalName : "unknown";
        String ext = rawOriginalName != null && rawOriginalName.contains(".")
            ? rawOriginalName.substring(rawOriginalName.lastIndexOf('.'))
            : "";
        String storedKey = "issues/" + issueId + "/" + UUID.randomUUID() + ext;
        String contentType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";

        try {
            minioService.upload(storedKey, file.getInputStream(), file.getSize(), contentType);
        } catch (Exception e) {
            throw new RuntimeException("Upload to storage failed", e);
        }

        Attachment attachment = Attachment.builder()
                .issue(issue)
                .uploadedBy(uploader)
                .originalName(originalName)
                .storedKey(storedKey)
                .contentType(contentType)
                .fileSize(file.getSize())
                .build();

        Attachment saved = attachmentRepository.save(attachment);
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<AttachmentResponse> listByIssue(String slug, Long projectId, Long issueId) {
        findScopedIssue(slug, projectId, issueId);
        return attachmentRepository.findByIssueIdOrderByCreatedAtDesc(issueId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public void delete(String slug, Long projectId, Long issueId, Long attachmentId, Long userId) {
        Attachment attachment = findScopedAttachment(slug, projectId, issueId, attachmentId);

        User requester = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));

        boolean isOwner = attachment.getUploadedBy() != null
                && attachment.getUploadedBy().getId().equals(requester.getId());
        if (!isOwner) {
            throw new ForbiddenException("You are not the owner of this attachment");
        }

        minioService.delete(attachment.getStoredKey());
        attachmentRepository.delete(attachment);
    }

    private Issue findScopedIssue(String slug, Long projectId, Long issueId) {
        Issue issue = issueRepository.findById(issueId)
                .orElseThrow(() -> new ResourceNotFoundException("Issue not found: " + issueId));

        boolean inExpectedProject = issue.getProject() != null && projectId.equals(issue.getProject().getId());
        boolean inExpectedWorkspace = inExpectedProject
                && issue.getProject().getWorkspace() != null
                && slug.equals(issue.getProject().getWorkspace().getSlug());

        if (!inExpectedWorkspace) {
            throw new ResourceNotFoundException("Issue not found in requested project/workspace: " + issueId);
        }

        return issue;
    }

    private Attachment findScopedAttachment(String slug, Long projectId, Long issueId, Long attachmentId) {
        Attachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found: " + attachmentId));

        if (attachment.getIssue() == null || !issueId.equals(attachment.getIssue().getId())) {
            throw new ResourceNotFoundException("Attachment not found for issue: " + attachmentId);
        }

        Issue scopedIssue = findScopedIssue(slug, projectId, issueId);
        if (!scopedIssue.getId().equals(attachment.getIssue().getId())) {
            throw new ResourceNotFoundException("Attachment not found in requested scope: " + attachmentId);
        }

        return attachment;
    }

    private AttachmentResponse toResponse(Attachment a) {
        String downloadUrl;
        try {
            downloadUrl = minioService.presignedGetUrl(a.getStoredKey());
        } catch (Exception e) {
            downloadUrl = null;
        }

        return AttachmentResponse.builder()
                .id(a.getId())
                .issueId(a.getIssue().getId())
                .originalName(a.getOriginalName())
                .contentType(a.getContentType())
                .fileSize(a.getFileSize())
                .createdAt(a.getCreatedAt())
                .uploadedByName(a.getUploadedBy() != null ? a.getUploadedBy().getDisplayName() : "Unknown")
                .downloadUrl(downloadUrl)
                .build();
    }
}
