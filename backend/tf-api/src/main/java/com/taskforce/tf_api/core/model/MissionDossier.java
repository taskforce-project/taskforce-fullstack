package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
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
 * Le dossier d'une mission (TF-J2-7, V135) : la ligne à laquelle pendent ses événements, ses sceaux et ses textes. Elle
 * ne pend qu'à l'espace de travail : supprimer l'issue, le projet ou la mission ne l'efface pas, et la base refuse de la
 * modifier. Elle garde ce qu'il faut pour dire qui peut encore lire le dossier, et le paquet de règles tel qu'il est
 * parti avec la mission ({@code taskforce-rules/1}), pour qu'un tiers rejuge chaque action.
 */
@Entity
@Table(name = "mission_dossiers")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MissionDossier {

    /** La mission du dossier ; elle peut ne plus exister. */
    @Id
    @Column(name = "run_id")
    private Long runId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false, updatable = false)
    private Workspace workspace;

    /** Le projet de l'issue au départ ; il peut ne plus exister. */
    @Column(name = "project_id", updatable = false)
    private Long projectId;

    @Column(name = "issue_id", updatable = false)
    private Long issueId;

    @Column(name = "issue_key", length = 80, updatable = false)
    private String issueKey;

    /** La personne qui a délégué, et qui répond de la mission ; nulle quand son compte est supprimé. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "delegated_by")
    private User delegatedBy;

    /** Le paquet de règles remis à la mission, en JSON ; nul pour un dossier ouvert avant la 1.18. */
    @Column(name = "rules_bundle", columnDefinition = "TEXT")
    private String rulesBundle;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Ce que porte le lien du témoin (R159, second tour, M-b) : un identifiant du dossier, opaque et tiré au hasard (128
     * bits, en hexadécimal), sans l'espace ni le numéro de la mission. Posé une fois, la première fois qu'il sert.
     */
    @Column(name = "link_id", length = 32, unique = true)
    private String linkId;

    /** Quand le témoin a fini d'essayer, écrit ou non : le passage régulier ne le relance plus (N2). */
    @Column(name = "witnessed_at")
    private LocalDateTime witnessedAt;
}
