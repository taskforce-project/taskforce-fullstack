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

@Entity
@Table(
    name = "slack_channels",
    indexes = {
        @Index(name = "idx_slack_channels_workspace_id", columnList = "workspace_id")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SlackChannel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(name = "channel_id", nullable = false, length = 64)
    private String channelId;

    @Column(name = "channel_name", nullable = false, length = 128)
    private String channelName;

    @org.hibernate.annotations.Array(length = 32)
    @Column(name = "event_types", columnDefinition = "text[]")
    @Builder.Default
    private String[] eventTypes = new String[]{};

    @Column(name = "active", nullable = false)
    @Builder.Default
    private Boolean active = true;

    // --- Miroir Slack → chat TaskForce ---
    // Id du canal de chat (module chat) qui reçoit les messages importés.
    // Stocké en Long brut (pas de relation JPA) : SlackChannel est en `core`, Channel en `modules.chat`
    // → interdit de dépendre de `modules` depuis `core` (règle shared ← core ← modules).
    @Column(name = "mirror_channel_id")
    private Long mirrorChannelId;

    @Column(name = "last_sync_ts", length = 32)
    private String lastSyncTs;   // curseur conversations.history (dernier ts importé)

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
