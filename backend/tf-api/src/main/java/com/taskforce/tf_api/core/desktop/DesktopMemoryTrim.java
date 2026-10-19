package com.taskforce.tf_api.core.desktop;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Rend au système la mémoire du démarrage. Spring et Hibernate laissent au lancement des dizaines de mégaoctets
 * d'objets qui ne servent plus ; le ramasse-miettes série de l'app (cf. {@code desktop/src/backend.ts}) ne réduit le tas
 * qu'après une collecte complète, qui sur un poste au calme peut ne jamais venir. Une collecte une fois l'API prête, et
 * le tas retombe à ce que l'app utilise, dans les bornes {@code -XX:MinHeapFreeRatio} et {@code -XX:MaxHeapFreeRatio}.
 */
@Slf4j
@Component
@Profile("desktop")
public class DesktopMemoryTrim {

    private static final long MB = 1024L * 1024L;

    @EventListener(ApplicationReadyEvent.class)
    public void trimAfterStartup() {
        long before = Runtime.getRuntime().totalMemory();
        System.gc();
        log.info("Tas Java après le démarrage : {} Mo réservés (avant la collecte : {} Mo)",
            Runtime.getRuntime().totalMemory() / MB, before / MB);
    }
}
