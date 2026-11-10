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
 * Un fichier qu'une mission a changé (R139, séance n°20), tel que le runner l'a relu dans le dossier de travail : ses
 * lignes ajoutées et retirées, et son patch (ou son contenu, dans un dossier jetable). Remplacé à chaque relevé.
 */
@Entity
@Table(name = "delivery_run_changes")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeliveryRunChange {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private DeliveryRun run;

    @Column(nullable = false, length = 1024)
    private String path;

    /** {@code added}, {@code modified}, {@code deleted}, ou {@code written} dans un dossier jetable. */
    @Column(nullable = false, length = 16)
    private String status;

    /** Lignes ajoutées et retirées ; absentes pour un binaire. */
    private Integer added;

    private Integer removed;

    @Column(name = "is_binary", nullable = false)
    private boolean binary;

    /** Le texte est coupé, ou n'a pas pu partir : le compte reste vrai. */
    @Column(nullable = false)
    private boolean truncated;

    /** Un fichier qui peut porter un secret : son texte n'a jamais quitté le poste. */
    @Column(nullable = false)
    private boolean withheld;

    /** L'empreinte de ce qui a changé : l'écran relit le diff d'un fichier quand elle bouge. */
    @Column(nullable = false, length = 64)
    private String revision;

    /** Le patch, ou le contenu dans un dossier jetable ; absent d'un binaire ou d'un fichier retenu. */
    @Column(columnDefinition = "TEXT")
    private String body;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
