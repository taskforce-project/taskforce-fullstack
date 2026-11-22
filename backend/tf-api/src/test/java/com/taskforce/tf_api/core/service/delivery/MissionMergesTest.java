package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.enums.DeliveryRunOutcome;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.service.MergedPullRequests;

/** La décision de fin prise sur GitHub (R212, rubrique 6) : la pull request de la mission fusionnée hors de TaskForce. */
@ExtendWith(MockitoExtension.class)
@DisplayName("Une pull request fusionnée sur GitHub, au dossier de sa mission")
class MissionMergesTest {

    @Mock private DeliveryRunRepository runs;
    @Mock private MissionEvidenceService evidence;
    @InjectMocks private MissionMerges merges;

    private static DeliveryRun run(long id, String url, DeliveryRunStatus status, DeliveryRunOutcome outcome) {
        return DeliveryRun.builder().id(id).status(status).outcome(outcome).resultUrl(url).build();
    }

    @Test
    @DisplayName("la mission qui a ouvert la pull request garde qui l'a fusionnée, quand, et où")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void the_mission_that_opened_it_keeps_the_merge() {
        DeliveryRun mission = run(100L, "https://github.com/acme/website/pull/212", DeliveryRunStatus.DONE, null);
        when(runs.findByIssueIdOrderByCreatedAtDesc(55L)).thenReturn(List.of(
            run(101L, "https://github.com/acme/website/pull/213", DeliveryRunStatus.DONE, null), mission));

        merges.onMerged(new MergedPullRequests.PullRequestMerged(55L, "acme/website", 212, "octocat", "2026-11-22T10:00:00Z"));

        ArgumentCaptor<Map<String, Object>> data = (ArgumentCaptor) ArgumentCaptor.forClass(Map.class);
        verify(evidence).appendAfterEnd(eq(mission), eq("human.decision"), eq(new MissionEvidenceService.Actor("person", "github:octocat")),
            data.capture());
        assertThat(data.getValue()).containsEntry("decision", "MERGE").containsEntry("where", "github")
            .containsEntry("by", "octocat").containsEntry("mergedAt", "2026-11-22T10:00:00Z");
    }

    @Test
    @DisplayName("un résultat déjà tranché dans TaskForce ne reçoit rien : son geste est déjà au dossier")
    void a_decided_result_gets_nothing() {
        when(runs.findByIssueIdOrderByCreatedAtDesc(55L)).thenReturn(List.of(
            run(100L, "https://github.com/acme/website/pull/212", DeliveryRunStatus.DONE, DeliveryRunOutcome.APPLIED)));

        merges.onMerged(new MergedPullRequests.PullRequestMerged(55L, "acme/website", 212, null, null));

        verify(evidence, never()).appendAfterEnd(any(), any(), any(), any());
    }

    @Test
    @DisplayName("sans compte GitHub connu, l'acteur est GitHub")
    void an_unknown_merger_is_github() {
        DeliveryRun mission = run(100L, "https://github.com/acme/website/pull/212", DeliveryRunStatus.DONE, null);
        when(runs.findByIssueIdOrderByCreatedAtDesc(55L)).thenReturn(List.of(mission));

        merges.onMerged(new MergedPullRequests.PullRequestMerged(55L, "Acme/Website", 212, " ", null));

        verify(evidence).appendAfterEnd(eq(mission), eq("human.decision"), eq(new MissionEvidenceService.Actor("person", "github")), any());
    }

    @Test
    @DisplayName("rien sans issue")
    void nothing_without_an_issue() {
        merges.onMerged(new MergedPullRequests.PullRequestMerged(null, "acme/website", 212, null, null));

        verify(runs, never()).findByIssueIdOrderByCreatedAtDesc(any());
    }
}
