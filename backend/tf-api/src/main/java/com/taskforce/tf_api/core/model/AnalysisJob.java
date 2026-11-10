package com.taskforce.tf_api.core.model;

import com.taskforce.tf_api.core.enums.AnalysisDepth;
import com.taskforce.tf_api.core.enums.AnalysisJobStatus;
import com.taskforce.tf_api.shared.audit.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Un workflow d'analyse IA, exécuté en arrière-plan et observable en direct.
 *
 * <p>C'est la trace durable de ce que l'agent a fait : son statut, poussé en STOMP à chaque changement, la question
 * et la réponse, l'erreur, le brief produit. On peut rouvrir le panneau « AI Workflows » et retrouver un workflow
 * là où il en était. Le plan d'étapes figé qu'il portait (colonne {@code plan_json}) est supprimé (TF-J1-3).
 *
 * <p>Boucle <b>HITL</b> : en mode {@link AnalysisDepth#DEEP}, le modèle peut suspendre le workflow
 * ({@link AnalysisJobStatus#WAITING_FOR_INPUT}) en posant une {@code question} ; la {@code answer}
 * de l'humain est réinjectée dans le prompt et l'exécution reprend.
 *
 * <p>{@code dismissed} est un masquage (soft delete) : retirer un workflow du dock n'efface pas
 * l'historique de ce que l'IA a produit.
 */
@Entity
@Table(
    name = "analysis_job",
    indexes = { @Index(name = "idx_analysis_job_workspace", columnList = "workspace_id") }
)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnalysisJob extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    /** Qui a lancé l'analyse (null si le compte a été supprimé depuis). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    @Builder.Default
    private AnalysisDepth depth = AnalysisDepth.QUICK;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    @Builder.Default
    private AnalysisJobStatus status = AnalysisJobStatus.QUEUED;

    /** HITL : question posée par le modèle (non nulle ssi {@code status = WAITING_FOR_INPUT}). */
    @Column(columnDefinition = "TEXT")
    private String question;

    /** HITL : réponse de l'humain, réinjectée dans le prompt. */
    @Column(columnDefinition = "TEXT")
    private String answer;

    /** Message d'échec (non nul ssi {@code status = FAILED}). */
    @Column(columnDefinition = "TEXT")
    private String error;

    /** Brief produit (non nul ssi {@code status = DONE}). */
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "brief_id")
    private DecisionBriefEntity brief;

    /** Masqué du dock — l'historique est conservé. */
    @Column(nullable = false)
    @Builder.Default
    private boolean dismissed = false;
}
