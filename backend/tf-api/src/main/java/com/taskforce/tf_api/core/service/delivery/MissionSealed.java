package com.taskforce.tf_api.core.service.delivery;

/**
 * Le dossier d'une mission vient d'être scellé à sa fin (TF-J2-7) : sa tête peut s'écrire chez un témoin, là où
 * l'exploitant n'est pas seul à écrire (la pull request de la mission, Q31). Publié dans la transaction de la fin, lu
 * après son commit.
 *
 * @param runId la mission
 * @param root  la tête de la chaîne scellée
 * @param seq   son rang
 */
public record MissionSealed(Long runId, String root, int seq) {
}
