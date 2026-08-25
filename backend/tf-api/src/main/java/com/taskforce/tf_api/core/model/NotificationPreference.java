package com.taskforce.tf_api.core.model;

import com.taskforce.tf_api.shared.audit.AuditableEntity;

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
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Préférence de notification d'un utilisateur pour un événement donné.
 *
 * <p>Modèle « <b>absence = défaut</b> » : aucune ligne n'est seedée. Quand aucune préférence n'existe
 * pour {@code (user, eventKey)}, le service applique le défaut (in-app actif, email inactif). Une ligne
 * n'est donc créée que lorsque l'utilisateur modifie explicitement un réglage.</p>
 *
 * <p>Portée <b>compte</b> (globale, pas par workspace) : c'est un réglage personnel, comme le reste du
 * groupe « Personal » des paramètres.</p>
 */
@Entity
@Table(
    name = "notification_preferences",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_notif_pref_user_event",
        columnNames = {"user_id", "event_key"}
    ),
    indexes = @Index(name = "idx_notif_pref_user_id", columnList = "user_id")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationPreference extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Propriétaire de la préférence. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** Clé de l'événement (voir {@link NotificationEvent#key()}). */
    @Column(name = "event_key", nullable = false, length = 50)
    private String eventKey;

    /** Canal in-app (cloche + temps réel). Défaut TRUE. */
    @Column(name = "in_app", nullable = false)
    @Builder.Default
    private boolean inApp = true;

    /** Canal email (opt-in). Défaut FALSE. */
    @Column(name = "email", nullable = false)
    @Builder.Default
    private boolean email = false;
}
