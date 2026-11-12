package com.taskforce.tf_api.modules.storage.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.HexFormat;

import com.taskforce.tf_api.modules.storage.domain.StorageKind;
import com.taskforce.tf_api.modules.storage.domain.StorageTarget;

/**
 * L'écrivain d'une cible (séance n°22, R156) : il vérifie le dossier que la personne choisit, puis y range un document,
 * sans jamais remplacer un fichier qui s'y trouve. Une cible de plus (Box, Dropbox, Nextcloud) est un écrivain de plus.
 */
public interface DocumentWriter {

    StorageKind kind();

    /** La cible se propose-t-elle sur cette instance ? La machine : l'app desktop seulement. */
    default boolean offered() {
        return true;
    }

    /**
     * Ce que la personne doit faire avant d'y ranger ({@link StorageTargetService#READY}, {@code CONNECT},
     * {@code ALLOW_CHANGES}) : le stockage de l'entreprise s'écrit par sa propre connexion.
     */
    default String readiness(Long workspaceId, Long userId) {
        return StorageTargetService.READY;
    }

    /**
     * Vérifie la cible que la personne choisit et la complète de ce que l'éditeur en dit (le nom et le lien du dossier) :
     * le dossier existe, et elle peut y écrire. Lève une {@code BusinessException} qui dit quoi faire sinon.
     */
    StorageTarget check(Long workspaceId, Long userId, StorageTarget wanted);

    /** Range le document dans la cible, pour cette personne et avec ses droits. */
    Written write(Long workspaceId, Long userId, StorageTarget target, DocumentFile file);

    /** Le lien qui ouvre un document rangé ici : celui de l'éditeur par défaut ; nul quand il n'y en a pas. */
    default String link(com.taskforce.tf_api.modules.storage.domain.StoredDocument doc) {
        return doc.getWebUrl();
    }

    /** Le document à ranger : un texte Markdown que TaskForce a écrit, son nom de fichier et son empreinte. */
    record DocumentFile(String title, String fileName, String mediaType, byte[] content, String sha256) {

        public static final String MARKDOWN = "text/markdown";
        private static final int MAX_NAME = 120;

        /** Un document Markdown, nommé d'après son titre. */
        public static DocumentFile markdown(String title, String content) {
            byte[] bytes = (content == null ? "" : content).getBytes(StandardCharsets.UTF_8);
            return new DocumentFile(title, fileName(title, ".md"), MARKDOWN, bytes, sha256(bytes));
        }

        /**
         * Un nom de fichier sûr partout (Windows, Google Drive, SharePoint) : sans séparateur ni caractère réservé, sans
         * point ni espace au bout, borné ; « Document » quand le titre n'en laisse rien. Un nom que Windows réserve à un
         * périphérique ({@code CON}, {@code PRN}, {@code AUX}, {@code NUL}, {@code COM0} à {@code COM9} et
         * {@code COM¹} à {@code COM³}, {@code LPT0} à {@code LPT9} et {@code LPT¹} à {@code LPT³}, {@code CONIN$},
         * {@code CONOUT$}, avec ou sans extension) est renommé.
         */
        static String fileName(String title, String extension) {
            String base = Normalizer.normalize(title == null ? "" : title, Normalizer.Form.NFC)
                .replaceAll("[\\\\/:*?\"<>|#%{}~&\\p{Cntrl}]", " ")
                .replaceAll("\\s+", " ").strip();
            while (base.endsWith(".")) base = base.substring(0, base.length() - 1).strip();
            if (base.length() > MAX_NAME) base = base.substring(0, MAX_NAME).strip();
            if (base.isEmpty()) base = "Document";
            int dot = base.indexOf('.');
            String stem = (dot < 0 ? base : base.substring(0, dot)).strip();
            if (DEVICE.matcher(stem).matches()) base = "Document " + base;
            return base + extension;
        }

        /** Les noms que Windows réserve à un périphérique, quelle que soit la casse. */
        private static final java.util.regex.Pattern DEVICE =
            java.util.regex.Pattern.compile("(?i)(CON|PRN|AUX|NUL|COM[0-9¹²³]|LPT[0-9¹²³]|CONIN\\$|CONOUT\\$)");

        static String sha256(byte[] bytes) {
            try {
                return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    /**
     * Où le document a été rangé : l'emplacement (clé d'objet, chemin, identifiant chez l'éditeur), le lecteur chez
     * Microsoft, le nom du fichier tel qu'il a été écrit (suffixé quand le nom était pris), son lien et sa version.
     */
    record Written(String location, String driveId, String fileName, String webUrl, String version) {}
}
