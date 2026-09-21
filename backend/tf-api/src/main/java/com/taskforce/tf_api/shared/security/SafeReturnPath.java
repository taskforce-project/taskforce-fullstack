package com.taskforce.tf_api.shared.security;

/**
 * Chemin de retour après un flux OAuth (anti <b>open redirect</b>).
 *
 * <p>Le chemin vient du navigateur et finit dans un {@code Location:} émis par notre callback : sans
 * contrôle, un lien piégé ferait passer l'utilisateur par notre domaine (donc par sa confiance) avant de
 * l'envoyer ailleurs. On n'accepte donc qu'un chemin <b>relatif à l'application</b>, borné au workspace
 * qui a lancé le flux, fait de caractères sans surprise. Tout le reste rend {@code null} : l'appelant
 * retombe alors sur sa destination par défaut, il n'y a jamais d'erreur à exploiter.</p>
 */
public final class SafeReturnPath {

    private static final int MAX_LENGTH = 300;

    private SafeReturnPath() {}

    /**
     * @param returnTo      chemin demandé par le client (peut être null)
     * @param workspaceSlug workspace du flux : le chemin doit y rester
     * @return le chemin s'il est sûr, sinon {@code null}
     */
    public static String withinWorkspace(String returnTo, String workspaceSlug) {
        if (returnTo == null || returnTo.isBlank() || workspaceSlug == null || workspaceSlug.isBlank()) {
            return null;
        }
        String path = returnTo.trim();
        if (path.length() > MAX_LENGTH) {
            return null;
        }
        // Relatif à l'application : ni « //hôte », ni schéma, ni antislash (lu comme « / » par des navigateurs),
        // ni « @ » (userinfo), ni caractère de contrôle ou encodé qui masquerait l'un d'eux.
        if (!path.startsWith("/") || path.startsWith("//") || path.contains("\\") || path.contains("://")
            || path.contains("@") || path.contains("%") || path.contains("..")) {
            return null;
        }
        if (!path.chars().allMatch(c -> c > 0x20 && c < 0x7f)) {
            return null;
        }
        String root = "/" + workspaceSlug;
        boolean inWorkspace = path.equals(root) || path.startsWith(root + "/") || path.startsWith(root + "?");
        return inWorkspace ? path : null;
    }
}
