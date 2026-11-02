package com.taskforce.tf_api.core.service.ai;

import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Les réglages courants de la passerelle de modèles. Lus au démarrage dans l'environnement du processus, comme le
 * faisait l'ai-service ; l'app desktop les remplace quand la personne change de fournisseur dans ses réglages, sans
 * redémarrer le backend (DesktopAiService). Rien n'est écrit : ni en base, ni dans un fichier.
 */
@Component
@Slf4j
public class AiProviderConfig {

    private final AtomicReference<AiProviderSettings> current = new AtomicReference<>();
    /** Change à chaque remplacement : l'état de l'IA gardé en cache n'est plus valable. */
    private final AtomicLong version = new AtomicLong();

    @Autowired
    public AiProviderConfig(Environment environment) {
        this(AiProviderSettings.from(environment::getProperty));
    }

    public AiProviderConfig(AiProviderSettings initial) {
        current.set(initial);
        log.info("AI gateway: {}", initial.describe());
    }

    public AiProviderSettings current() {
        return current.get();
    }

    public long version() {
        return version.get();
    }

    /**
     * Remplace les réglages par ceux que donnent {@code variables} (les noms de {@link AiProviderSettings#VARIABLES}) ;
     * une variable absente compte comme vide, rien ne reste des réglages précédents.
     */
    public AiProviderSettings replace(Map<String, String> variables) {
        AiProviderSettings next = AiProviderSettings.from(variables::get);
        current.set(next);
        version.incrementAndGet();
        log.info("AI gateway changed: {}", next.describe());
        return next;
    }
}
