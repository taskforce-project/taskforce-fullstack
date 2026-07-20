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
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.modules.ged.domain.Attachment;
import com.taskforce.tf_api.modules.ged.dto.response.AttachmentResponse;
import com.taskforce.tf_api.modules.ged.repository.AttachmentRepository;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Pièces jointes d'une issue (stockage MinIO).
 *
 * <p><b>Contrôle d'accès</b> — chaque opération fait DEUX vérifications distinctes, et aucune ne
 * remplace l'autre :</p>
 * <ul>
 *   <li>{@link #findScopedIssue} : l'issue appartient bien au projet ET au workspace de l'URL.
 *       C'est du <i>scope</i>, pas de l'autorisation : ça ne dit rien de <b>qui</b> demande.</li>
 *   <li>{@link ProjectVisibilityGuard} : l'appelant a le droit de voir (lecture) ou de contribuer
 *       (écriture) à ce projet. C'est la règle « autorisation au niveau service » du projet, qui
 *       manquait ici (PC-034).</li>
 * </ul>
 *
 * <p><b>Ce que l'absence de garde ouvrait exactement.</b> Un compte étranger au workspace était
 * déjà arrêté en amont par {@code WorkspaceAccessInterceptor} (403). La faille exploitable était
 * plus étroite, mais réelle : un <b>membre du workspace</b> pouvait lire et téléverser les pièces
 * jointes d'un <b>projet privé dont il n'est pas membre</b>, le contrôle de scope se contentant de
 * vérifier le rattachement au workspace. Aggravant : l'URL présignée renvoyée n'exige ensuite plus
 * aucune authentification pendant une heure — la fuite survivait à la requête.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AttachmentService {

    private static final long MAX_FILE_SIZE = 25 * 1024 * 1024L; // 25 MB

    private final AttachmentRepository attachmentRepository;
    private final IssueRepository issueRepository;
    private final UserRepository userRepository;
    private final MinioService minioService;
    private final ProjectVisibilityGuard visibilityGuard;

    @Transactional
    public AttachmentResponse upload(String slug, Long projectId, Long issueId, MultipartFile file, Long userId) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("File is empty");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException("File exceeds 25 MB limit");
        }

        // Écriture : le rôle VIEWER est en lecture seule, et un projet privé est invisible (→ 404).
        Issue issue = findWritableIssue(slug, projectId, issueId, userId);

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
    public List<AttachmentResponse> listByIssue(String slug, Long projectId, Long issueId, Long userId) {
        findViewableIssue(slug, projectId, issueId, userId);
        return attachmentRepository.findByIssueIdOrderByCreatedAtDesc(issueId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public void delete(String slug, Long projectId, Long issueId, Long attachmentId, Long userId) {
        // La garde passe AVANT le contrôle de propriété : sans elle, un non-membre obtenait un 403
        // « vous n'êtes pas le propriétaire », ce qui confirme l'existence de la pièce jointe. Avec,
        // un projet qu'il ne voit pas renvoie 404 et ne révèle rien.
        Attachment attachment = findScopedAttachment(slug, projectId, issueId, attachmentId, userId);

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

    /** Issue de l'URL + droit de LECTURE sur son projet (projet invisible → 404, pas de fuite). */
    private Issue findViewableIssue(String slug, Long projectId, Long issueId, Long userId) {
        Issue issue = findScopedIssue(slug, projectId, issueId);
        visibilityGuard.assertCanView(issue.getProject(), userId);
        return issue;
    }

    /** Issue de l'URL + droit de CONTRIBUTION sur son projet (404 si invisible, refus si VIEWER). */
    private Issue findWritableIssue(String slug, Long projectId, Long issueId, Long userId) {
        Issue issue = findScopedIssue(slug, projectId, issueId);
        visibilityGuard.assertCanWrite(issue.getProject(), userId);
        return issue;
    }

    /** Vérifie UNIQUEMENT le rattachement projet/workspace — ne dit rien de l'appelant. */
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

    private Attachment findScopedAttachment(String slug, Long projectId, Long issueId, Long attachmentId, Long userId) {
        Attachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found: " + attachmentId));

        if (attachment.getIssue() == null || !issueId.equals(attachment.getIssue().getId())) {
            throw new ResourceNotFoundException("Attachment not found for issue: " + attachmentId);
        }

        Issue scopedIssue = findWritableIssue(slug, projectId, issueId, userId);
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
            log.warn("Présignature MinIO échouée pour {} : {}", a.getStoredKey(), e.getMessage());
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
