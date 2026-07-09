package com.taskforce.tf_api.core.dto.response;

/**
 * Un champ de configuration demandé à la connexion (pilote le formulaire UI).
 *
 * @param key      clé technique (envoyée dans le body de connexion)
 * @param label    intitulé affiché
 * @param secret   vrai = champ masqué (clé/secret), stocké chiffré
 * @param required champ obligatoire
 */
public record ConnectorField(String key, String label, boolean secret, boolean required) {

    public static ConnectorField secret(String key, String label) {
        return new ConnectorField(key, label, true, true);
    }

    public static ConnectorField text(String key, String label) {
        return new ConnectorField(key, label, false, true);
    }
}
