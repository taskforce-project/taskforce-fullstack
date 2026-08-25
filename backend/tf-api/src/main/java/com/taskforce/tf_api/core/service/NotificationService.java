package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.NotificationResponse;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueComment;
import com.taskforce.tf_api.core.model.Notification;
import com.taskforce.tf_api.core.model.NotificationEvent;
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
    private final SimpMessagingTemplate  messagingTemplate;
    private final NotificationPreferenceService preferenceService;
    private final EmailService           emailService;

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
        dispatch(notif);
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
            dispatch(notif);
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
            dispatch(notif);
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
            dispatch(notif);
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
        // Libellés en anglais : ils sont rendus TELS QUELS par le Signal Center (pas de clé i18n
        // côté notification), donc c'est ici que se joue la langue de l'inbox.
        String title   = issue.getTitle() + (overdue ? " — deadline breached" : " — due soon");
        // Alerte système : pas d'acteur (actor null)
        Notification notif = buildNotification(issue, null, assignee, type, urgency, title, null);
        dispatch(notif);
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
        String title      = memberName + " is overloaded (" + openCount + " open issues)";
        String body       = "Workload above the threshold (" + threshold + "). Consider rebalancing assignments.";

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
            dispatch(notif);
        }
    }

    // =========================================================================
    // Helpers privés
    // =========================================================================

    /**
     * Point de sortie unique de TOUS les chemins de création. Applique les réglages du destinataire
     * (voir {@link NotificationPreferenceService}) :
     * <ul>
     *   <li><b>in-app</b> actif → persiste la ligne (l'inbox) + push temps réel ;</li>
     *   <li><b>email</b> actif → envoi best-effort (no-op si SMTP inactif).</li>
     * </ul>
     * Ni le push ni l'email ne doivent casser la transaction métier appelante.
     *
     * <p>Note : si in-app est OFF et email ON, aucune ligne n'est persistée — donc pas de déduplication
     * pour les alertes récurrentes (dueDate/overload), l'email peut alors se répéter au rythme du
     * scheduler. Le défaut (in-app ON) évite ce cas ; c'est un choix assumé plutôt que persister une
     * ligne « fantôme » invisible dans la cloche.</p>
     */
    private void dispatch(Notification notif) {
        User recipient = notif.getRecipient();
        Optional<NotificationEvent> event = NotificationEvent.fromType(notif.getType());
        NotificationPreferenceService.Channels channels = preferenceService.resolve(recipient.getId(), event);

        if (channels.inApp()) {
            Notification saved = notificationRepository.save(notif);
            pushRealtime(saved);
        }

        if (channels.email()) {
            emailService.sendNotificationEmail(
                recipient.getEmail(),
                recipient.getDisplayName(),
                emailLabel(notif.getType()),
                notif.getTitle(),
                notif.getBody(),
                notif.getIssueIdentifier(),
                notif.getIssueUrl()
            );
        }
    }

    /**
     * Pousse la notification en temps réel au destinataire (best-effort).
     * Destination : {@code /topic/notifications.{recipientId}} (même payload que le REST).
     */
    private void pushRealtime(Notification saved) {
        try {
            messagingTemplate.convertAndSend(
                "/topic/notifications." + saved.getRecipient().getId(),
                toResponse(saved)
            );
        } catch (Exception ex) {
            log.warn("Publication temps réel notification échouée (destinataire {}): {}",
                saved.getRecipient().getId(), ex.getMessage());
        }
    }

    /** Libellé court de l'événement pour l'email (badge + objet). */
    private String emailLabel(String type) {
        if (type == null) return "Notification";
        return switch (type) {
            case "assigned"      -> "Assigned to you";
            case "mention"       -> "You were mentioned";
            case "commented"     -> "New comment";
            case "statusChanged" -> "Status update";
            case "completed"     -> "Completed";
            case "dueSoon"       -> "Due soon";
            case "overdue"       -> "Overdue";
            case "overload"      -> "Workload alert";
            default              -> "Notification";
        };
    }

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
                .email(a.getEmail())
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
