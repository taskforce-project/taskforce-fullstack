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

/**
 * Les sondes de la relecture R159 de #551 sur le témoin, écrites pour tourner aussi sur le code d'avant le correctif
 * (68964f2d), où elles échouent : B2 (le nom de l'espace et un hôte interne dans une pull request publique), M1 (un lien
 * vers 127.0.0.1 depuis l'app de bureau), L7 (une mission sans pull request ne laissait aucune note).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Le témoin, sondes de la relecture R159 (#551)")
class MissionWitnessProbeTest {

    private static final String ROOT = "sha256:" + "9".repeat(64);

    @Mock private DeliveryRunRepository runRepository;
    @Mock private GitHubPullRequests pullRequests;
    @Mock private MissionEvidenceService evidence;
    @Mock private PlatformTransactionManager transactionManager;

    private DeliveryRun run;

    @BeforeEach
    void setUp() {
        // L'espace créé par défaut prend le prénom de son propriétaire.
        Workspace workspace = Workspace.builder().id(1L).slug("pierre").build();
        Project project = Project.builder().id(12L).workspace(workspace).build();
        run = DeliveryRun.builder().id(100L).issue(Issue.builder().id(55L).project(project).build()).status(DeliveryRunStatus.DONE)
            .resultUrl("https://github.com/acme/website/pull/212").build();
    }

    private String bodyWritten(String frontendUrl) {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.comment(eq(1L), eq("acme/website"), eq(212), anyString())).thenReturn(Optional.empty());
        new MissionWitness(runRepository, pullRequests, evidence, transactionManager, frontendUrl).write(new MissionSealed(100L, ROOT, 31));
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(pullRequests).comment(eq(1L), eq("acme/website"), eq(212), body.capture());
        return body.getValue();
    }

    @Test
    @DisplayName("B2 : sans savoir le dépôt privé, ni le nom de l'espace ni l'hôte interne ; l'empreinte de tête, toujours")
    void a_public_or_unknown_repository_gets_no_name_and_no_host() {
        String body = bodyWritten("https://taskforce.intra.acme.fr");

        assertThat(body).contains(ROOT).doesNotContain("pierre").doesNotContain("intra.acme.fr").doesNotContain("http");
    }

    @Test
    @DisplayName("M1 : jamais un lien vers la machine elle-même (l'app de bureau)")
    void never_a_link_to_the_machine_itself() {
        String body = bodyWritten("http://127.0.0.1:43123");

        assertThat(body).contains(ROOT).doesNotContain("127.0.0.1").doesNotContain("pierre");
    }

    @Test
    @DisplayName("L7 : une mission sans pull request laisse une note qui le dit")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void a_mission_without_pull_request_says_so() {
        run.setResultUrl(null);
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));

        new MissionWitness(runRepository, pullRequests, evidence, transactionManager, "https://app.taskforce.dev")
            .write(new MissionSealed(100L, ROOT, 31));

        verify(pullRequests, never()).comment(anyLong(), any(), anyInt(), any());
        ArgumentCaptor<Map<String, Object>> data = (ArgumentCaptor) ArgumentCaptor.forClass(Map.class);
        verify(evidence).appendToDossier(eq(100L), eq("note"), eq(MissionEvidenceService.Actor.SERVER), data.capture());
        assertThat(data.getValue()).containsEntry("kind", "witness").containsEntry("written", false)
            .containsEntry("reason", "This mission has no pull request.");
    }
}
