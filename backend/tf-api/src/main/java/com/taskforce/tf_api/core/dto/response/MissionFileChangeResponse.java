package com.taskforce.tf_api.core.dto.response;

/**
 * Le texte d'un fichier d'une mission (R139).
 *
 * @param format    {@code diff} (un patch, blocs {@code @@}) ou {@code text} (le contenu d'un fichier d'un dossier jetable)
 * @param body      le texte ; null pour un binaire, un fichier retenu, ou un texte qui n'a pas pu partir
 * @param truncated le texte est coupé
 * @param withheld  un fichier qui peut porter un secret : son texte n'a jamais quitté le poste
 * @param revision  l'empreinte de ce qui a changé
 */
public record MissionFileChangeResponse(
    String path,
    String format,
    String body,
    boolean binary,
    boolean truncated,
    boolean withheld,
    String revision
) {}
