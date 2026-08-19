package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Notification destinée à un utilisateur, scopée par workspace.
 * Générée automatiquement lors d'événements sur les issues.
 */
@Entity
@Table(
    name = "notifications",
    indexes = {
        @Index(name = "idx_notif_recipient_id",  columnList = "recipient_id"),
        @Index(name = "idx_notif_workspace_id",  columnList = "workspace_id"),
        @Index(name = "idx_notif_read",          columnList = "read"),
        @Index(name = "idx_notif_created_at",    columnList = "created_at")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Utilisateur qui reçoit la notification */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_id", nullable = false)
    private User recipient;

    /** Workspace de contexte */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    /** Utilisateur qui a déclenché l'événement (nullable pour les alertes système) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    private User actor;

    /**
     * Type d'événement : mention | assigned | commented | statusChanged |
     * dueSoon | overdue | completed
     */
    @Column(name = "type", nullable = false, length = 50)
    private String type;

    /**
     * Urgence : critical | warning | info | low
     */
    @Column(name = "urgency", nullable = false, length = 20)
    @Builder.Default
    private String urgency = "info";

    /** Lu par le destinataire */
    @Column(name = "read", nullable = false)
    @Builder.Default
    private boolean read = false;

    /** Acquitté (dismissed) par le destinataire */
    @Column(name = "acknowledged", nullable = false)
    @Builder.Default
    private boolean acknowledged = false;

    /** Titre de la notification (généralement le titre de l'issue) */
    @Column(nullable = false)
    private String title;

    /** Corps optionnel (extrait du commentaire, etc.) */
    @Column(columnDefinition = "TEXT")
    private String body;

    /** Identifiant de l'issue (ex: TF-38) */
    @Column(name = "issue_identifier", length = 50)
    private String issueIdentifier;

    /** URL relative vers l'issue */
    @Column(name = "issue_url")
    private String issueUrl;

    /** Nom du projet */
    @Column(name = "project_name")
    private String projectName;

    /** URL relative vers le projet */
    @Column(name = "project_url")
    private String projectUrl;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
