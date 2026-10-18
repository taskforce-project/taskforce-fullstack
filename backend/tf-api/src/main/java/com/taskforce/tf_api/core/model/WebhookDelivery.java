package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;
import java.util.UUID;

import com.taskforce.tf_api.core.enums.WebhookDeliveryStatus;
import com.taskforce.tf_api.shared.audit.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Un envoi de webhook (OSS-6.2) : le corps JSON d'un événement pour un webhook abonné, écrit dans la transaction
 * qui produit l'événement, puis envoyé et retenté par le {@code WebhookDispatcher}.
 */
@Entity
@Table(name = "webhook_deliveries")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WebhookDelivery extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "webhook_id", nullable = false)
    private Webhook webhook;

    /** Identifiant envoyé dans {@code X-TaskForce-Delivery}, le même à chaque tentative (dédoublonnage). */
    @Column(name = "delivery_id", nullable = false, unique = true)
    private UUID deliveryId;

    @Column(name = "event_type", nullable = false, length = 64)
    private String eventType;

    /** Corps JSON envoyé, signé tel quel. */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String payload;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private WebhookDeliveryStatus status = WebhookDeliveryStatus.PENDING;

    @Column(nullable = false)
    @Builder.Default
    private Integer attempts = 0;

    @Column(name = "next_attempt_at", nullable = false)
    private LocalDateTime nextAttemptAt;

    /** Code HTTP de la dernière tentative ; null quand le serveur n'a pas répondu. */
    @Column(name = "last_status")
    private Integer lastStatus;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "delivered_at")
    private LocalDateTime deliveredAt;
}
