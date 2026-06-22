package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.NotificationResponse;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueComment;
import com.taskforce.tf_api.core.model.Notification;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.NotificationRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Service de gestion des notifications.
 *
 * Les méthodes notify* sont appelées depuis IssueService lors d'événements métier.
 * Les méthodes de lecture/mise à jour sont exposées via NotificationController.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    private static final int DEFAULT_PAGE_SIZE = 50;

    private final NotificationRepository notificationRepository;
    private final WorkspaceRepository    workspaceRepository;
    private final UserRepository         userRepository;

    // =========================================================================
    // Lecture
    // =========================================================================

    /**
     * Liste les notifications non acquittées d'un utilisateur dans un workspace.
     */
    @Transactional(readOnly = true)
    public List<NotificationResponse> listNotifications(String workspaceSlug, Long userId) {
        Workspace workspace = resolveWorkspace(workspaceSlug);
        Page<Notification> page = notificationRepository
            .findByRecipientIdAndWorkspaceIdAndAcknowledgedFalseOrderByCreatedAtDesc(
                userId, workspace.getId(), PageRequest.of(0, DEFAULT_PAGE_SIZE)
            );
        return page.stream().map(this::toResponse).toList();
    }

    /**
     * Compte les notifications non lues d'un utilisateur dans un workspace.
     */
    @Transactional(readOnly = true)
    public long countUnread(String workspaceSlug, Long userId) {
        Workspace workspace = resolveWorkspace(workspaceSlug);
        return notificationRepository.countByRecipientIdAndWorkspaceIdAndReadFalse(userId, workspace.getId());
    }

    // =========================================================================
    // Actions
    // =========================================================================

    /**
     * Marque une notification comme lue.
     */
    @Transactional
    public NotificationResponse markAsRead(Long notificationId, Long userId) {
        Notification notif = notificationRepository.findById(notificationId)
            .orElseThrow(() -> new ResourceNotFoundException("Notification introuvable"));

        if (!notif.getRecipient().getId().equals(userId)) {
            throw new ResourceNotFoundException("Notification introuvable");
        }

        notif.setRead(true);
        return toResponse(notificationRepository.save(notif));
    }

    /**
     * Acquitte (dismiss) une notification unique : read=true + acknowledged=true.
     */
    @Transactional
    public NotificationResponse acknowledge(Long notificationId, Long userId) {
        Notification notif = notificationRepository.findById(notificationId)
            .orElseThrow(() -> new ResourceNotFoundException("Notification introuvable"));

        if (!notif.getRecipient().getId().equals(userId)) {
            throw new ResourceNotFoundException("Notification introuvable");
        }

        notif.setRead(true);
        notif.setAcknowledged(true);
        return toResponse(notificationRepository.save(notif));
    }

    /**
     * Marque toutes les notifications d'un workspace comme lues.
     */
    @Transactional
    public int markAllAsRead(String workspaceSlug, Long userId) {
        Workspace workspace = resolveWorkspace(workspaceSlug);
        return notificationRepository.markAllAsRead(userId, workspace.getId());
    }

    /**
     * Acquitte (dismiss) toutes les notifications d'un workspace.
     */
    @Transactional
    public int acknowledgeAll(String workspaceSlug, Long userId) {
        Workspace workspace = resolveWorkspace(workspaceSlug);
        return notificationRepository.acknowledgeAll(userId, workspace.getId());
    }

    // =========================================================================
    // Génération de notifications (appelées depuis IssueService)
    // =========================================================================

    /**
     * Notifie l'assignee quand une issue lui est assignée.
     */
    @Transactional
    public void notifyAssigned(Issue issue, User actor) {
        if (issue.getAssignee() == null) return;
        if (issue.getAssignee().getId().equals(actor.getId())) return; // pas de self-notification

        Notification notif = buildNotification(issue, actor, issue.getAssignee(), "assigned", "info",
            issue.getTitle(), null);
        notificationRepository.save(notif);
    }

    /**
     * Notifie reporter + assignee quand un commentaire est posté.
     */
    @Transactional
    public void notifyCommented(Issue issue, User actor, IssueComment comment) {
        List<User> recipients = buildRecipients(issue, actor);
        String body = truncate(comment.getContent(), 200);

        for (User recipient : recipients) {
            Notification notif = buildNotification(issue, actor, recipient, "commented", "low",
                issue.getTitle(), body);
            notificationRepository.save(notif);
        }
    }

    /**
     * Notifie reporter + assignee quand le statut d'une issue change.
     */
    @Transactional
    public void notifyStatusChanged(Issue issue, User actor, String newStatusName) {
        List<User> recipients = buildRecipients(issue, actor);
        String title = issue.getTitle();

        for (User recipient : recipients) {
            String urgency = "low";
            String type = "statusChanged";
            // Si le nouveau statut est "Done" / COMPLETED, type = completed
            if (issue.getCompletedAt() != null) {
                type = "completed";
            }
            Notification notif = buildNotification(issue, actor, recipient, type, urgency,
                title + " — moved to " + newStatusName, null);
            notificationRepository.save(notif);
        }
    }

    /**
     * Notifie les utilisateurs mentionnés dans un commentaire.
     * La détection des mentions (@userId) est déléguée à l'appelant.
     */
    @Transactional
    public void notifyMentions(Issue issue, User actor, List<User> mentionedUsers, String commentBody) {
        for (User mentioned : mentionedUsers) {
            if (mentioned.getId().equals(actor.getId())) continue;
            Notification notif = buildNotification(issue, actor, mentioned, "mention", "warning",
                issue.getTitle(), truncate(commentBody, 200));
            notificationRepository.save(notif);
        }
    }

    /**
     * Notifie l'assignee qu'une issue arrive à échéance (dueSoon) ou l'a dépassée (overdue).
     * Idempotent par jour : ne reposte pas si une alerte du même type non acquittée existe déjà.
     */
    @Transactional
    public void notifyDueDate(Issue issue, boolean overdue) {
        User assignee = issue.getAssignee();
        if (assignee == null) return;

        String type       = overdue ? "overdue" : "dueSoon";
        String identifier = issue.getProject().getIdentifier() + "-" + issue.getSequenceNumber();

        // Dédup : pas de doublon tant que l'utilisateur n'a pas acquitté l'alerte précédente
        if (notificationRepository.existsByRecipientIdAndIssueIdentifierAndTypeAndAcknowledgedFalse(
                assignee.getId(), identifier, type)) {
            return;
        }

        String urgency = overdue ? "critical" : "warning";
        String title   = issue.getTitle() + (overdue ? " — échéance dépassée" : " — échéance proche");
        // Alerte système : pas d'acteur (actor null)
        Notification notif = buildNotification(issue, null, assignee, type, urgency, title, null);
        notificationRepository.save(notif);
    }

    /**
     * Alerte de <b>surcharge</b> d'un membre (PROD-1.5). Centrée membre (pas d'issue) :
     * {@code issueUrl} pointe vers le profil du membre pour réutiliser le rendu de l'inbox.
     * Dédup par (destinataire, clé membre, type) tant que l'alerte n'est pas acquittée.
     */
    @Transactional
    public void notifyOverload(Workspace workspace, User member, int openCount, int threshold,
                               List<User> recipients) {
        String slug       = workspace.getSlug();
        String memberName = member.getDisplayName() != null ? member.getDisplayName() : member.getEmail();
        String type       = "overload";
        String dedupKey   = "overload-" + member.getId();
        String memberUrl  = "/" + slug + "/members/" + member.getId();
        String membersUrl = "/" + slug + "/members";
        String title      = memberName + " est en surcharge (" + openCount + " tâches ouvertes)";
        String body       = "Charge au-dessus du seuil (" + threshold + "). Pensez à rééquilibrer les assignations.";

        for (User recipient : recipients) {
            if (recipient == null) continue;
            if (notificationRepository.existsByRecipientIdAndIssueIdentifierAndTypeAndAcknowledgedFalse(
                    recipient.getId(), dedupKey, type)) {
                continue;
            }
            Notification notif = Notification.builder()
                .recipient(recipient)
                .workspace(workspace)
                .actor(null)
                .type(type)
                .urgency("warning")
                .title(title)
                .body(body)
                .issueIdentifier(dedupKey)
                .issueUrl(memberUrl)
                .projectName(workspace.getName())
                .projectUrl(membersUrl)
                .build();
            notificationRepository.save(notif);
        }
    }

    // =========================================================================
    // Helpers privés
    // =========================================================================

    private Notification buildNotification(Issue issue, User actor, User recipient,
                                           String type, String urgency, String title, String body) {
        Workspace workspace = issue.getProject().getWorkspace();
        String slug          = workspace.getSlug();
        Long   projectId     = issue.getProject().getId();
        String identifier    = issue.getProject().getIdentifier() + "-" + issue.getSequenceNumber();
        String issueUrl      = "/" + slug + "/projects/" + projectId + "/issues/" + issue.getId();
        String projectUrl    = "/" + slug + "/projects/" + projectId;
        String projectName   = issue.getProject().getName();

        return Notification.builder()
            .recipient(recipient)
            .workspace(workspace)
            .actor(actor)
            .type(type)
            .urgency(urgency)
            .title(title)
            .body(body)
            .issueIdentifier(identifier)
            .issueUrl(issueUrl)
            .projectName(projectName)
            .projectUrl(projectUrl)
            .build();
    }

    /** Collecte les destinataires (reporter + assignee), en excluant l'acteur */
    private List<User> buildRecipients(Issue issue, User actor) {
        List<User> recipients = new ArrayList<>();
        if (issue.getAssignee() != null && !issue.getAssignee().getId().equals(actor.getId())) {
            recipients.add(issue.getAssignee());
        }
        if (issue.getReporter() != null && !issue.getReporter().getId().equals(actor.getId())
                && (issue.getAssignee() == null || !issue.getReporter().getId().equals(issue.getAssignee().getId()))) {
            recipients.add(issue.getReporter());
        }
        return recipients;
    }

    private String truncate(String text, int maxLength) {
        if (text == null) return null;
        return text.length() > maxLength ? text.substring(0, maxLength) + "…" : text;
    }

    private Workspace resolveWorkspace(String slug) {
        return workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable : " + slug));
    }

    // =========================================================================
    // Mapping
    // =========================================================================

    private NotificationResponse toResponse(Notification n) {
        NotificationResponse.ActorSummary actorSummary = null;
        if (n.getActor() != null) {
            User a = n.getActor();
            String name     = a.getDisplayName() != null ? a.getDisplayName() : a.getEmail();
            String initials = buildInitials(name);
            actorSummary = NotificationResponse.ActorSummary.builder()
                .id(a.getId())
                .name(name)
                .initials(initials)
                .avatarUrl(a.getAvatarUrl())
                .build();
        }

        return NotificationResponse.builder()
            .id(n.getId())
            .type(n.getType())
            .urgency(n.getUrgency())
            .read(n.isRead())
            .acknowledged(n.isAcknowledged())
            .actor(actorSummary)
            .title(n.getTitle())
            .body(n.getBody())
            .issueIdentifier(n.getIssueIdentifier())
            .issueUrl(n.getIssueUrl())
            .projectName(n.getProjectName())
            .projectUrl(n.getProjectUrl())
            .createdAt(n.getCreatedAt())
            .build();
    }

    private String buildInitials(String name) {
        if (name == null || name.isBlank()) return "?";
        String[] parts = name.trim().split("\\s+");
        if (parts.length >= 2) {
            return (parts[0].charAt(0) + "" + parts[1].charAt(0)).toUpperCase();
        }
        return name.substring(0, Math.min(2, name.length())).toUpperCase();
    }
}
