package com.taskforce.tf_api.modules.chat.service;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.repository.SlackChannelRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Poller du miroir Slack : importe périodiquement les nouveaux messages de tous les canaux
 * Slack ayant un miroir configuré (sync auto, sans clic manuel).
 *
 * <p>Intervalle réglable via {@code integrations.slack.mirror.poll-interval-ms} (60 s par défaut).
 * Désactivable via {@code integrations.slack.mirror.poll-enabled=false} (mis à false en profil de test).
 * Chaque canal est synchronisé dans sa propre transaction ({@link SlackMirrorService#syncMirrored})
 * → l'échec d'un canal (token invalide, rate-limit…) n'affecte pas les autres.</p>
 */
@Component
@ConditionalOnProperty(name = "integrations.slack.mirror.poll-enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class SlackMirrorPoller {

    private final SlackChannelRepository slackChannelRepository;
    private final SlackMirrorService     mirrorService;

    @Scheduled(fixedDelayString = "${integrations.slack.mirror.poll-interval-ms:60000}")
    public void poll() {
        List<Long> ids = slackChannelRepository.findMirroredChannelIds();
        if (ids.isEmpty()) return;
        int total = 0;
        for (Long id : ids) {
            try {
                total += mirrorService.syncMirrored(id);
            } catch (Exception e) {
                log.warn("Poll miroir Slack : sync du canal {} échouée : {}", id, e.getMessage());
            }
        }
        if (total > 0) log.info("Poll miroir Slack : {} message(s) importé(s) sur {} canal(aux)", total, ids.size());
    }
}
