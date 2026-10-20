package com.taskforce.tf_api.core.desktop;

import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.service.GitHubIntegrationService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * App desktop : GitHub ne peut pas la prévenir (pas de webhook entrant), alors elle relit d'elle-même les pull requests
 * ouvertes liées aux tickets, toutes les cinq minutes tant qu'elle est ouverte. Une PR fusionnée termine son ticket.
 */
@Slf4j
@Component
@Profile("desktop")
@RequiredArgsConstructor
public class DesktopPullRequestWatch {

    /** PR relues au plus par passage : borne les appels à GitHub. */
    static final int BUDGET = 10;

    private final GitHubIntegrationService github;

    @Scheduled(initialDelayString = "${desktop.github.watch-initial-delay:PT2M}", fixedDelayString = "${desktop.github.watch-every:PT5M}")
    public void refresh() {
        try {
            int completed = github.refreshOpenPullRequests(BUDGET);
            if (completed > 0) {
                log.info("Pull requests fusionnées : {} ticket(s) terminé(s)", completed);
            }
        } catch (RuntimeException e) {
            log.warn("Pull requests liées non relues : {}", e.getMessage());
        }
    }
}
