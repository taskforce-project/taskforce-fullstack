package com.taskforce.tf_api.core.model;

import com.taskforce.tf_api.shared.audit.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * Un événement de la chronologie d'un run (OSS-5.3) : démarrage de l'agent, texte, appel d'outil, échec ou refus,
 * relayé par le runner local. {@code seq} ordonne les événements d'un run.
 */
@Entity
@Table(name = "delivery_run_events")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeliveryRunEvent extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private DeliveryRun run;

    @Column(nullable = false)
    private Integer seq;

    /** {@code start}, {@code text}, {@code tool}, {@code error} ou {@code denied}. */
    @Column(nullable = false, length = 16)
    private String kind;

    /** Outil concerné (« Bash », « taskforce: get_issue »), ou null. */
    @Column(length = 120)
    private String tool;

    @Column(nullable = false, length = 2000)
    private String text;
}
