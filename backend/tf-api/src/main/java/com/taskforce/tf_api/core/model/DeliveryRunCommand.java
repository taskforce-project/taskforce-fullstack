package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.DeliveryCommandKind;
import com.taskforce.tf_api.core.enums.DeliveryCommandStatus;

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
 * Un ordre pour le runner qui a porté une mission (R139, R140) : remettre un fichier comme avant, ou passer une correction
 * à l'agent. Le backend ne joint pas un poste local : le runner vient le chercher, le fait, et rend ce qui s'est passé.
 */
@Entity
@Table(name = "delivery_run_commands")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeliveryRunCommand {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private DeliveryRun run;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private DeliveryCommandKind kind;

    /** Le fichier à remettre comme avant. */
    @Column(length = 1024)
    private String path;

    /** La correction tapée par la personne. */
    @Column(length = 2000)
    private String text;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private DeliveryCommandStatus status = DeliveryCommandStatus.PENDING;

    /** Ce qui s'est passé, en mots ; montré à la personne quand le geste n'a pas abouti. */
    @Column(length = 1000)
    private String message;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requested_by")
    private User requestedBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "taken_at")
    private LocalDateTime takenAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;
}
