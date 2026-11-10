package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Les fichiers qu'une mission a changés, tels que le runner les a relevés (R139, séance n°20). Ce qui n'est pas possible
 * n'est pas proposé (R15) : {@code canRevert} et {@code canComment} sont calculés ici, et {@code blockedReason} dit
 * pourquoi quand la personne peut y faire quelque chose.
 *
 * @param mode          {@code repo}, {@code scratch}, ou null tant que le runner n'a rien relevé
 * @param live          la mission travaille encore : la liste va bouger
 * @param files         les fichiers, sans leur texte (il se lit fichier par fichier)
 * @param more          les fichiers au-delà du plafond, comptés dans les totaux
 * @param canRevert     cette personne peut remettre un fichier comme avant, maintenant
 * @param canComment    cette personne peut commenter des lignes et demander des changements, maintenant
 * @param canCorrect    cette personne peut parler à l'agent pendant son travail
 * @param blockedReason pourquoi ces gestes manquent, quand une phrase utile existe
 * @param correction    ce qu'est devenue sa dernière correction : un mot, ou null
 */
public record MissionChangesResponse(
    String mode,
    boolean live,
    long added,
    long removed,
    int more,
    List<File> files,
    boolean canRevert,
    boolean canComment,
    boolean canCorrect,
    String blockedReason,
    Correction correction
) {

    /**
     * @param reverting le runner est en train de le remettre comme avant
     * @param error     pourquoi la dernière tentative n'a pas abouti, en mots ; null sinon
     */
    public record File(
        String path,
        String status,
        Integer added,
        Integer removed,
        boolean binary,
        boolean truncated,
        boolean withheld,
        String revision,
        boolean reverting,
        String error,
        LocalDateTime updatedAt
    ) {}

    /**
     * @param status  {@code PENDING}, {@code RUNNING}, {@code DONE}, {@code FAILED} ou {@code EXPIRED}
     * @param message ce qui s'est passé, en mots
     */
    public record Correction(Long id, String text, String status, String message) {}
}
