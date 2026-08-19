package com.taskforce.tf_api.core.service;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.repository.IssueRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link DueDateAlertScheduler}.
 *
 * <p>Ce job tient en dix lignes, et c'est précisément pour cela qu'il mérite des tests : tout ce
 * qu'il fait de non trivial tient dans <b>deux calculs de date</b>, et une erreur d'un jour sur l'un
 * ou l'autre ne se voit pas à la lecture.</p>
 *
 * <ul>
 *   <li>L'<b>horizon</b> envoyé au dépôt détermine quelles issues sont seulement <i>candidates</i>.
 *       Trop court, des échéances proches ne sont jamais remontées ; trop long, l'inbox se remplit
 *       de bruit.</li>
 *   <li>Le drapeau <b>{@code overdue}</b> détermine l'urgence affichée. La frontière est
 *       {@code isBefore(today)}, donc une issue due <b>aujourd'hui</b> n'est <b>pas</b> en retard.
 *       C'est le cas limite que ces tests figent.</li>
 * </ul>
 *
 * <p>La déduplication n'est délibérément pas testée ici : elle appartient à
 * {@link NotificationService#notifyDueDate}, et le job lui délègue sans condition. Vérifier ici que
 * deux passes ne créent qu'une notification testerait la dépendance, pas le job.</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("DueDateAlertScheduler")
class DueDateAlertSchedulerTest {

    /** Doit rester aligné sur {@code DueDateAlertScheduler.DUE_SOON_DAYS} (constante privée). */
    private static final int DUE_SOON_DAYS = 2;

    @Mock private IssueRepository     issueRepository;
    @Mock private NotificationService notificationService;

    @InjectMocks private DueDateAlertScheduler scheduler;

    @Captor private ArgumentCaptor<LocalDate> horizonCaptor;

    private static Issue issueDueIn(long days) {
        return Issue.builder()
            .title("Issue à échéance J" + (days >= 0 ? "+" : "") + days)
            .dueDate(LocalDate.now().plusDays(days))
            .build();
    }

    @Test
    @DisplayName("interroge le dépôt sur un horizon de 2 jours")
    void queriesRepositoryWithTwoDayHorizon() {
        when(issueRepository.findOpenAssignedDueOnOrBefore(any())).thenReturn(List.of());

        scheduler.scanDueDates();

        verify(issueRepository).findOpenAssignedDueOnOrBefore(horizonCaptor.capture());
        assertThat(horizonCaptor.getValue())
            .as("horizon = aujourd'hui + %d jours", DUE_SOON_DAYS)
            .isEqualTo(LocalDate.now().plusDays(DUE_SOON_DAYS));
    }

    @ParameterizedTest(name = "échéance J{0} → overdue = {1}")
    @DisplayName("qualifie le retard par rapport à aujourd'hui, bornes incluses")
    @CsvSource({
        "-30, true",   // largement dépassée
        "-1,  true",   // dépassée d'un jour
        "0,   false",  // due AUJOURD'HUI : ce n'est pas encore un retard
        "1,   false",  // due demain
        "2,   false",  // dernière échéance couverte par l'horizon
    })
    void flagsOverdueRelativeToToday(long daysFromToday, boolean expectedOverdue) {
        when(issueRepository.findOpenAssignedDueOnOrBefore(any()))
            .thenReturn(List.of(issueDueIn(daysFromToday)));

        scheduler.scanDueDates();

        verify(notificationService).notifyDueDate(any(Issue.class), eq(expectedOverdue));
    }

    @Test
    @DisplayName("notifie chaque issue remontée, une fois")
    void notifiesEveryReturnedIssue() {
        when(issueRepository.findOpenAssignedDueOnOrBefore(any()))
            .thenReturn(List.of(issueDueIn(-3), issueDueIn(0), issueDueIn(2)));

        scheduler.scanDueDates();

        verify(notificationService, times(3)).notifyDueDate(any(Issue.class), any(Boolean.class));
        // Une passée, deux à venir — la répartition doit suivre la frontière du jour.
        verify(notificationService, times(1)).notifyDueDate(any(Issue.class), eq(true));
        verify(notificationService, times(2)).notifyDueDate(any(Issue.class), eq(false));
    }

    @Test
    @DisplayName("ne notifie rien quand aucune issue n'arrive à échéance")
    void staysSilentWhenNothingIsDue() {
        when(issueRepository.findOpenAssignedDueOnOrBefore(any())).thenReturn(List.of());

        scheduler.scanDueDates();

        verifyNoInteractions(notificationService);
    }

    @Test
    @DisplayName("ne filtre pas lui-même : il fait confiance à la requête du dépôt")
    void doesNotRefilterWhatTheRepositoryReturned() {
        // Le dépôt garantit déjà « ouverte + assignée + échéance <= horizon » (requête JPQL).
        // Si le job re-filtrait, une divergence entre les deux conditions créerait un trou
        // silencieux : des issues remontées puis ignorées, sans trace. Ce test fige le contrat.
        when(issueRepository.findOpenAssignedDueOnOrBefore(any()))
            .thenReturn(List.of(issueDueIn(90)));

        scheduler.scanDueDates();

        verify(notificationService).notifyDueDate(any(Issue.class), eq(false));
        verify(notificationService, never()).notifyDueDate(any(Issue.class), eq(true));
    }
}
