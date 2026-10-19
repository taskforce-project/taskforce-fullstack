package com.taskforce.tf_api.modules.ged.service;

import java.io.InputStream;

/**
 * Stockage des fichiers de l'app (pièces jointes, avatars, fichiers du Brain OS), désignés par une clé.
 *
 * <p>Deux implémentations : {@link MinioService} (webapp et auto-hébergement) et, dans l'app desktop,
 * {@link LocalObjectStorage}, qui range les fichiers dans le dossier de données de l'app.</p>
 */
public interface ObjectStorage {

    /** Range le contenu sous cette clé, en remplaçant un fichier existant. */
    void upload(String objectKey, InputStream stream, long size, String contentType);

    /** Lien de téléchargement temporaire, utilisable sans jeton par le navigateur. */
    String presignedGetUrl(String objectKey);

    /** Supprime le fichier ; sans effet s'il n'existe pas. */
    void delete(String objectKey);

    /** Type de contenu enregistré à l'envoi. */
    String contentType(String objectKey);

    /** Contenu du fichier ; l'appelant ferme le flux. */
    InputStream getObjectStream(String objectKey);
}
