package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.service.GitHubPullRequests;
import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Le témoin (Q31, point 9 de la séance n°30) : à la fin de la mission, la tête de son dossier s'écrit dans sa pull
 * request, là où l'exploitant n'est pas seul à écrire, avec le lien de la page et rien d'autre ; ce qui s'est passé
 * entre au dossier.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Le témoin du dossier, dans la pull request")
class MissionWitnessTest {

    private static final String ROOT = "sha256:" + "9".repeat(64);

    @Mock private DeliveryRunRepository runRepository;
    @Mock private GitHubPullRequests pullRequests;
    @Mock private MissionEvidenceService evidence;
    @Mock private PlatformTransactionManager transactionManager;

    private MissionWitness witness;
    private DeliveryRun run;

    @BeforeEach
    void setUp() {
        witness = new MissionWitness(runRepository, pullRequests, evidence, transactionManager, "https://app.taskforce.dev/");
        Workspace workspace = Workspace.builder().id(1L).slug("acme").build();
        Project project = Project.builder().id(12L).workspace(workspace).build();
        run = DeliveryRun.builder().id(100L).issue(Issue.builder().id(55L).project(project).build()).status(DeliveryRunStatus.DONE)
            .resultUrl("https://github.com/acme/website/pull/212").build();
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> noted() {
        ArgumentCaptor<Map<String, Object>> data = (ArgumentCaptor) ArgumentCaptor.forClass(Map.class);
        verify(evidence).appendToDossier(eq(100L), eq("note"), eq(MissionEvidenceService.Actor.SERVER), data.capture());
        return data.getValue();
    }

    @Test
    @DisplayName("la tête et le lien de la page, rien d'autre ; le dossier garde où le témoin est écrit")
    void the_head_is_written_in_the_pull_request() {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.comment(eq(1L), eq("acme/website"), eq(212), anyString()))
            .thenReturn(Optional.of("https://github.com/acme/website/pull/212#issuecomment-1"));

        witness.write(new MissionSealed(100L, ROOT, 31));

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(pullRequests).comment(eq(1L), eq("acme/website"), eq(212), body.capture());
        assertThat(body.getValue()).isEqualTo("TaskForce evidence of this pull request: `" + ROOT + "` (event 31 of mission 100).\n"
            + "Verification page: https://app.taskforce.dev/acme/missions/100/verification");
        assertThat(noted()).containsEntry("kind", "witness").containsEntry("where", "github-pull-request")
            .containsEntry("written", true).containsEntry("root", ROOT).containsEntry("seq", 31)
            .containsEntry("comment", "https://github.com/acme/website/pull/212#issuecomment-1");
    }

    @Test
    @DisplayName("GitHub refuse ou n'est pas relié : le dossier dit pourquoi le témoin manque")
    void a_refusal_is_kept_in_the_dossier() {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.comment(anyLong(), anyString(), anyInt(), anyString()))
            .thenThrow(new BusinessException("Connect GitHub in Settings > Integrations."));

        witness.write(new MissionSealed(100L, ROOT, 31));

        assertThat(noted()).containsEntry("written", false).containsEntry("reason", "Connect GitHub in Settings > Integrations.");
    }

    @Test
    @DisplayName("une mission sans pull request n'a pas de témoin : rien ne s'écrit, la page le dit")
    void no_pull_request_no_witness() {
        run.setResultUrl(null);
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));

        witness.write(new MissionSealed(100L, ROOT, 31));

        verify(pullRequests, never()).comment(anyLong(), any(), anyInt(), any());
        verify(evidence, never()).appendToDossier(any(), any(), any(), any());
    }

    @Test
    @DisplayName("la mission n'existe plus : rien ne s'écrit")
    void a_vanished_mission_writes_nothing() {
        when(runRepository.findById(100L)).thenReturn(Optional.empty());

        witness.onSealed(new MissionSealed(100L, ROOT, 31));

        verify(pullRequests, never()).comment(anyLong(), any(), anyInt(), any());
    }

    @Test
    @DisplayName("le lien de la page suit l'adresse de l'app")
    void the_page_url_follows_the_app() {
        assertThat(new MissionWitness(runRepository, pullRequests, evidence, transactionManager, "http://127.0.0.1:5173")
            .pageUrl("acme", 7L)).isEqualTo("http://127.0.0.1:5173/acme/missions/7/verification");
    }
}
