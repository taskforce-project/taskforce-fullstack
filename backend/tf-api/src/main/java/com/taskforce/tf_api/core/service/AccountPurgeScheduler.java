package com.taskforce.tf_api.core.service;

import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Purge quotidienne des comptes dont la suppression planifiée a dépassé le délai de grâce
 * (TF-ACCT-DELETE, étape 2). Le passage de flambeau + l'anonymisation + la suppression Keycloak
 * vivent dans {@link GdprService#purgeAccount} : l'appel est fait <b>cross-bean</b> (depuis ce
 * scheduler) pour que le {@code @Transactional} par compte s'applique réellement (un self-invocation
 * dans {@code GdprService} contournerait le proxy).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AccountPurgeScheduler {

    private final GdprService gdprService;

    /** Défaut : tous les jours à 04:00. Configurable via {@code taskforce.account.purge-cron}. */
    @Scheduled(cron = "${taskforce.account.purge-cron:0 0 4 * * *}")
    public void purgeExpiredAccounts() {
        List<Long> expired = gdprService.findExpiredForPurge();
        if (expired.isEmpty()) {
            return;
        }
        int done = 0;
        for (Long id : expired) {
            try {
                gdprService.purgeAccount(id);
                done++;
            } catch (Exception e) {
                log.error("Purge du compte {} échouée : {}", id, e.getMessage());
            }
        }
        log.info("Purge des comptes expirés (grâce écoulée) : {}/{} purgé(s)", done, expired.size());
    }
}
