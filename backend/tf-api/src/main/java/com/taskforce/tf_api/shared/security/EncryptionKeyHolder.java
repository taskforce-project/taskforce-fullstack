package com.taskforce.tf_api.shared.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Injecte la clé de chiffrement (RGPD C11.2) dans {@link EncryptedStringConverter} au démarrage,
 * et <b>refuse le démarrage en production</b> si elle est absente.
 *
 * <p>Les {@code AttributeConverter} sont instanciés par Hibernate (hors contexte Spring) : on passe
 * donc la clé par une variable statique, configurée ici à la création du bean (avant tout accès
 * entité). Clé via {@code security.encryption-key} (env/yml).</p>
 *
 * <p><b>Pourquoi une garde explicite plutôt qu'un placeholder sans valeur par défaut.</b> Déclarer
 * {@code ${TF_ENCRYPTION_KEY}} sans repli dans {@code application-prod.yml} ne suffit pas : Spring
 * n'échoue que si la propriété est <b>absente</b>, pas si elle est <b>vide</b>. Or Docker Compose
 * transmet {@code TF_ENCRYPTION_KEY: ""} dès que la variable existe sans valeur dans le fichier
 * d'environnement — cas le plus probable, puisque c'est exactement ce que produit un
 * {@code .env.prod} recopié depuis l'exemple et rempli à moitié. Le placeholder se résoudrait donc
 * sans erreur, et le chiffrement retomberait en silence sur le passe-plat. La seule garde fiable
 * teste la valeur, pas sa présence.</p>
 */
@Component
@Slf4j
public class EncryptionKeyHolder {

    public EncryptionKeyHolder(
        @Value("${security.encryption-key:}") String encryptionKey,
        Environment environment
    ) {
        boolean absente = encryptionKey == null || encryptionKey.isBlank();
        boolean production = environment.acceptsProfiles(Profiles.of("prod"));

        if (absente && production) {
            throw new IllegalStateException("""
                Chiffrement au repos impossible : « security.encryption-key » est vide alors que le \
                profil « prod » est actif. Renseigner TF_ENCRYPTION_KEY (phrase secrète longue et \
                aléatoire, cf. .env.prod.example). Démarrer sans clé écrirait les jetons OAuth et les \
                identifiants de connecteurs EN CLAIR en base, sans aucune erreur : l'échec au \
                démarrage est délibéré.""");
        }

        EncryptedStringConverter.configure(encryptionKey);

        // Hors production, l'état du chiffrement doit rester LISIBLE dans les journaux de démarrage.
        // Sans cette trace, une clé absente ne se manifeste nulle part et les écritures partent en
        // clair sans le moindre signal — c'est précisément le défaut trouvé le 24/07/2026.
        if (absente) {
            log.warn("Chiffrement au repos INACTIF : « security.encryption-key » est vide. "
                + "Les colonnes sensibles seront écrites EN CLAIR. Acceptable en développement, "
                + "impossible en production — où l'absence de clé empêche désormais le démarrage.");
        } else {
            log.info("Chiffrement au repos actif (AES-256-GCM).");
        }
    }
}
