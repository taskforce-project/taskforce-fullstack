package com.taskforce.tf_api.core.service;

import java.time.LocalDate;
import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.repository.IssueRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Job planifié qui génère les notifications d'échéance (dueSoon / overdue)
 * pour les issues ouvertes et assignées. La déduplication est assurée par
 * {@link NotificationService#notifyDueDate} (pas de doublon tant que l'alerte
 * précédente n'est pas acquittée).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DueDateAlertScheduler {

    /** Fenêtre "bientôt dû" : nombre de jours avant l'échéance */
    private static final int DUE_SOON_DAYS = 2;

    private final IssueRepository     issueRepository;
    private final NotificationService notificationService;

    /**
     * Tous les jours à 08:00 (fuseau serveur, UTC en dev).
     * Cron surchargeable via la propriété {@code taskforce.alerts.due-date-cron}.
     */
    @Scheduled(cron = "${taskforce.alerts.due-date-cron:0 0 8 * * *}")
    @Transactional
    public void scanDueDates() {
        LocalDate today   = LocalDate.now();
        LocalDate horizon = today.plusDays(DUE_SOON_DAYS);

        List<Issue> issues = issueRepository.findOpenAssignedDueOnOrBefore(horizon);
        int processed = 0;
        for (Issue issue : issues) {
            boolean overdue = issue.getDueDate().isBefore(today);
            notificationService.notifyDueDate(issue, overdue);
            processed++;
        }
        if (processed > 0) {
            log.info("Scan des échéances : {} issue(s) à échéance proche/dépassée traitée(s)", processed);
        }
    }
}
