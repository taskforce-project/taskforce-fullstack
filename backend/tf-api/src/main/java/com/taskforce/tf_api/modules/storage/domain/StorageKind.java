package com.taskforce.tf_api.modules.storage.domain;

import java.util.Locale;

import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Où TaskForce range ce qu'il écrit (séance n°22, R156) : le serveur de TaskForce (le défaut), un dossier de la machine
 * (l'app desktop seulement), ou le stockage de l'entreprise, par la connexion de la personne. Box, Dropbox et Nextcloud
 * viendront ici, avec leur écrivain ({@code DocumentWriter}) et leur préréglage : la colonne de la base n'est pas fermée.
 */
public enum StorageKind {

    SERVER("server", null),
    MACHINE("machine", null),
    GOOGLE_DRIVE("google-drive", "google-drive"),
    ONEDRIVE("onedrive", "microsoft-365");

    private final String wire;
    private final String connectorKey;

    StorageKind(String wire, String connectorKey) {
        this.wire = wire;
        this.connectorKey = connectorKey;
    }

    /** Le nom que l'API et l'écran emploient. */
    public String wire() {
        return wire;
    }

    /** Le connecteur par lequel on écrit chez l'entreprise ; nul pour le serveur et la machine. */
    public String connectorKey() {
        return connectorKey;
    }

    /** Le stockage de l'entreprise : une sortie (R93), par la connexion de la personne. */
    public boolean company() {
        return connectorKey != null;
    }

    public static StorageKind of(String wire) {
        if (wire != null) {
            String v = wire.trim().toLowerCase(Locale.ROOT);
            for (StorageKind k : values()) {
                if (k.wire.equals(v) || k.name().toLowerCase(Locale.ROOT).equals(v)) return k;
            }
        }
        throw new BusinessException("Unknown storage: " + wire);
    }
}
