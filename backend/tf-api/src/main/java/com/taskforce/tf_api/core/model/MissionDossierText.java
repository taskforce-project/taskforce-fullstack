package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

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
 * Un texte du dossier gardé à côté de la chaîne (R198 amendée, précision 4) : la chaîne n'en porte que l'empreinte. Le
 * titre, la description et le brief de la demande, ce que l'agent raconte, son résumé. Effacer le texte ne casse rien :
 * l'empreinte reste, et l'effacement garde qui et quand.
 */
@Entity
@Table(name = "mission_dossier_texts")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MissionDossierText {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "run_id", nullable = false, updatable = false)
    private Long runId;

    /** {@code sha256:} et l'empreinte du texte en UTF-8. */
    @Column(nullable = false, updatable = false, length = 71)
    private String hash;

    /** {@code title}, {@code description}, {@code brief}, {@code text}, {@code summary} ou {@code checklist}. */
    @Column(nullable = false, updatable = false, length = 16)
    private String kind;

    /** Le texte ; nul une fois effacé. */
    @Column(columnDefinition = "TEXT")
    private String body;

    @Column(name = "erased_at")
    private LocalDateTime erasedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "erased_by")
    private User erasedBy;
}
