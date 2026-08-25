package com.taskforce.tf_api.core.service;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.taskforce.tf_api.core.dto.response.NotificationResponse;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Notification;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.NotificationRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires (B-T7) — {@link NotificationService}.
 * Couvre : garde-fous de génération (pas de self-notification, assigné nul),
 * persistance + push temps réel, marquage lu/IDOR, comptage non-lus, résolution workspace.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("NotificationService")
class NotificationServiceTest {

    @Mock private NotificationRepository notificationRepository;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private UserRepository userRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private NotificationPreferenceService preferenceService;
    @Mock private EmailService emailService;

    @InjectMocks private NotificationService service;

    private static final String SLUG = "acme";

    private Workspace workspace;
    private Project project;

    @BeforeEach
    void setUp() {
        workspace = Workspace.builder().id(1L).slug(SLUG).name("Acme").build();
        project = Project.builder().id(5L).workspace(workspace).identifier("APP").name("App").build();
        // Défaut : in-app actif, email inactif -> comportement historique (persist + push, pas d'email).
        // lenient() car les tests de lecture/garde-fous ne déclenchent jamais dispatch().
        lenient().when(preferenceService.resolve(anyLong(), any()))
            .thenReturn(new NotificationPreferenceService.Channels(true, false));
    }

    private User user(long id, String name) {
        return User.builder().id(id).email(name + "@ex.dev").displayName(name).isActive(true).build();
    }

    private Issue issue(User assignee, User reporter) {
        return Issue.builder().id(9L).sequenceNumber(3).title("Fix bug")
            .project(project).assignee(assignee).reporter(reporter).build();
    }

    // =========================================================================
    @Nested
    @DisplayName("notifyAssigned")
    class NotifyAssigned {

        @Test
        @DisplayName("ne notifie pas quand l'issue n'a pas d'assigné")
        void should_skip_when_no_assignee() {
            service.notifyAssigned(issue(null, user(2L, "reporter")), user(2L, "reporter"));

            verify(notificationRepository, never()).save(any());
            verify(messagingTemplate, never()).convertAndSend(anyString(), any(Object.class));
        }

        @Test
        @DisplayName("ne s'auto-notifie pas quand l'acteur est l'assigné")
        void should_skip_self_assignment() {
            User self = user(10L, "self");
            service.notifyAssigned(issue(self, self), self);

            verify(notificationRepository, never()).save(any());
        }

        @Test
        @DisplayName("persiste et pousse en temps réel vers le destinataire")
        void should_persist_and_push() {
            User assignee = user(20L, "assignee");
            User actor = user(30L, "actor");
            when(notificationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            service.notifyAssigned(issue(assignee, actor), actor);

            verify(notificationRepository).save(any(Notification.class));
            verify(messagingTemplate).convertAndSend(eq("/topic/notifications.20"), any(Object.class));
        }

        @Test
        @DisplayName("notifyAssignmentDeclined prévient l'assigneur (refus)")
        void should_notify_assignment_declined() {
            User assigner = user(50L, "manager");
            User decliner = user(20L, "dev");
            when(notificationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            service.notifyAssignmentDeclined(issue(decliner, user(21L, "reporter")), assigner, decliner);

            verify(notificationRepository).save(any(Notification.class));
            verify(messagingTemplate).convertAndSend(eq("/topic/notifications.50"), any(Object.class));
        }

        @Test
        @DisplayName("notifyAssignmentDeclined ne fait rien sans assigneur connu")
        void should_skip_declined_without_assigner() {
            service.notifyAssignmentDeclined(issue(user(20L, "a"), user(21L, "r")), null, user(20L, "a"));
            verify(notificationRepository, never()).save(any());
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("notifyMentions")
    class NotifyMentions {

        @Test
        @DisplayName("notifie chaque mentionné sauf l'acteur lui-même")
        void should_notify_mentioned_except_actor() {
            User actor = user(30L, "actor");
            when(notificationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            service.notifyMentions(issue(null, actor), actor,
                java.util.List.of(user(40L, "a"), actor, user(41L, "b")), "coucou @40 @41");

            verify(notificationRepository, times(2)).save(any(Notification.class)); // actor exclu
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("markAsRead")
    class MarkAsRead {

        @Test
        @DisplayName("marque comme lue la notification du destinataire")
        void should_mark_read_for_owner() {
            User owner = user(7L, "owner");
            Notification notif = Notification.builder().id(100L).recipient(owner).type("assigned").read(false).build();
            when(notificationRepository.findById(100L)).thenReturn(Optional.of(notif));
            when(notificationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            NotificationResponse res = service.markAsRead(100L, 7L);

            assertThat(res.isRead()).isTrue();
            assertThat(notif.isRead()).isTrue();
        }

        @Test
        @DisplayName("cache l'existence (ResourceNotFoundException) si un autre utilisateur tente de la lire (IDOR)")
        void should_reject_other_user() {
            Notification notif = Notification.builder().id(100L).recipient(user(7L, "owner")).read(false).build();
            when(notificationRepository.findById(100L)).thenReturn(Optional.of(notif));

            assertThatThrownBy(() -> service.markAsRead(100L, 999L))
                .isInstanceOf(ResourceNotFoundException.class);
            verify(notificationRepository, never()).save(any());
        }

        @Test
        @DisplayName("lève ResourceNotFoundException quand la notification n'existe pas")
        void should_throw_when_not_found() {
            when(notificationRepository.findById(anyLong())).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.markAsRead(404L, 7L))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("countUnread / résolution workspace")
    class CountUnread {

        @Test
        @DisplayName("délègue au repository et renvoie le nombre de non-lues")
        void should_return_unread_count() {
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.of(workspace));
            when(notificationRepository.countByRecipientIdAndWorkspaceIdAndReadFalse(7L, 1L)).thenReturn(4L);

            assertThat(service.countUnread(SLUG, 7L)).isEqualTo(4L);
        }

        @Test
        @DisplayName("lève ResourceNotFoundException si le workspace est introuvable")
        void should_throw_when_workspace_missing() {
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.countUnread(SLUG, 7L))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("list / acknowledge / notify (autres)")
    class More {

        @Test
        @DisplayName("listNotifications mappe la page du repository")
        void should_list() {
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.of(workspace));
            when(notificationRepository.findByRecipientIdAndWorkspaceIdAndAcknowledgedFalseOrderByCreatedAtDesc(
                    eq(7L), eq(1L), any()))
                .thenReturn(new org.springframework.data.domain.PageImpl<>(java.util.List.of()));

            assertThat(service.listNotifications(SLUG, 7L)).isEmpty();
        }

        @Test
        @DisplayName("markAllAsRead / acknowledgeAll délèguent au repository")
        void should_mark_and_ack_all() {
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.of(workspace));
            when(notificationRepository.markAllAsRead(7L, 1L)).thenReturn(3);
            when(notificationRepository.acknowledgeAll(7L, 1L)).thenReturn(2);

            assertThat(service.markAllAsRead(SLUG, 7L)).isEqualTo(3);
            assertThat(service.acknowledgeAll(SLUG, 7L)).isEqualTo(2);
        }

        @Test
        @DisplayName("acknowledge marque lu + acquitté pour le destinataire")
        void should_acknowledge() {
            User owner = user(7L, "owner");
            Notification n = Notification.builder().id(50L).recipient(owner).read(false).acknowledged(false).build();
            when(notificationRepository.findById(50L)).thenReturn(Optional.of(n));
            when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            service.acknowledge(50L, 7L);

            assertThat(n.isAcknowledged()).isTrue();
            assertThat(n.isRead()).isTrue();
        }

        @Test
        @DisplayName("notifyCommented notifie assigné + reporter (hors acteur)")
        void should_notify_commented() {
            when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            service.notifyCommented(issue(user(20L, "a"), user(21L, "r")), user(30L, "actor"),
                com.taskforce.tf_api.core.model.IssueComment.builder().content("hi").build());

            verify(notificationRepository, times(2)).save(any());
        }

        @Test
        @DisplayName("notifyStatusChanged notifie les parties concernées")
        void should_notify_status_changed() {
            User assignee = user(20L, "a");
            User actor = user(30L, "actor");
            when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            service.notifyStatusChanged(issue(assignee, actor), actor, "Done");

            verify(notificationRepository, org.mockito.Mockito.atLeastOnce()).save(any());
        }

        @Test
        @DisplayName("notifyDueDate crée une alerte si pas déjà présente, sinon déduplique")
        void should_notify_due_date_with_dedup() {
            User assignee = user(20L, "a");
            Issue issue = issue(assignee, user(21L, "r"));
            when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            // 1er appel : pas de doublon → crée
            when(notificationRepository.existsByRecipientIdAndIssueIdentifierAndTypeAndAcknowledgedFalse(anyLong(), anyString(), anyString()))
                .thenReturn(false);
            service.notifyDueDate(issue, true);
            verify(notificationRepository, times(1)).save(any());

            // 2e appel : alerte déjà présente → dédup (pas de nouveau save)
            when(notificationRepository.existsByRecipientIdAndIssueIdentifierAndTypeAndAcknowledgedFalse(anyLong(), anyString(), anyString()))
                .thenReturn(true);
            service.notifyDueDate(issue, true);
            verify(notificationRepository, times(1)).save(any()); // toujours 1
        }

        @Test
        @DisplayName("notifyDueDate ne fait rien si l'issue n'a pas d'assigné")
        void should_skip_due_date_without_assignee() {
            service.notifyDueDate(issue(null, user(21L, "r")), false);
            verify(notificationRepository, never()).save(any());
        }

        @Test
        @DisplayName("notifyOverload notifie chaque destinataire (hors dédup)")
        void should_notify_overload() {
            when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));
            when(notificationRepository.existsByRecipientIdAndIssueIdentifierAndTypeAndAcknowledgedFalse(anyLong(), anyString(), anyString()))
                .thenReturn(false);

            service.notifyOverload(workspace, user(20L, "member"), 12, 8,
                java.util.List.of(user(1L, "owner"), user(2L, "admin")));

            verify(notificationRepository, times(2)).save(any());
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("Préférences (gating in-app / email)")
    class Preferences {

        @Test
        @DisplayName("in-app désactivé -> ni persistance ni push ni email")
        void should_skip_all_when_inapp_and_email_off() {
            when(preferenceService.resolve(anyLong(), any()))
                .thenReturn(new NotificationPreferenceService.Channels(false, false));

            service.notifyAssigned(issue(user(20L, "assignee"), user(30L, "actor")), user(30L, "actor"));

            verify(notificationRepository, never()).save(any());
            verify(messagingTemplate, never()).convertAndSend(anyString(), any(Object.class));
            verify(emailService, never()).sendNotificationEmail(
                anyString(), anyString(), anyString(), anyString(), any(), anyString(), anyString());
        }

        @Test
        @DisplayName("email activé -> persiste (in-app) ET envoie l'email au destinataire")
        void should_send_email_when_enabled() {
            when(preferenceService.resolve(anyLong(), any()))
                .thenReturn(new NotificationPreferenceService.Channels(true, true));
            when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            service.notifyAssigned(issue(user(20L, "assignee"), user(30L, "actor")), user(30L, "actor"));

            verify(notificationRepository).save(any(Notification.class));
            verify(emailService).sendNotificationEmail(
                eq("assignee@ex.dev"), anyString(), anyString(), anyString(), any(), anyString(), anyString());
        }

        @Test
        @DisplayName("email activé mais in-app désactivé -> email seul, aucune ligne inbox")
        void should_email_only_when_inapp_off() {
            when(preferenceService.resolve(anyLong(), any()))
                .thenReturn(new NotificationPreferenceService.Channels(false, true));

            service.notifyAssigned(issue(user(20L, "assignee"), user(30L, "actor")), user(30L, "actor"));

            verify(notificationRepository, never()).save(any());
            verify(emailService).sendNotificationEmail(
                anyString(), anyString(), anyString(), anyString(), any(), anyString(), anyString());
        }
    }
}
