package com.taskforce.tf_api.shared.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Injecte la clé de chiffrement (RGPD C11.2) dans {@link EncryptedStringConverter} au démarrage.
 *
 * <p>Les {@code AttributeConverter} sont instanciés par Hibernate (hors contexte Spring) : on passe
 * donc la clé par une variable statique, configurée ici à la création du bean (avant tout accès
 * entité). Clé via {@code security.encryption-key} (env/yml). Vide → chiffrement désactivé (clair).</p>
 */
@Component
public class EncryptionKeyHolder {

    public EncryptionKeyHolder(@Value("${security.encryption-key:}") String encryptionKey) {
        EncryptedStringConverter.configure(encryptionKey);
    }
}
