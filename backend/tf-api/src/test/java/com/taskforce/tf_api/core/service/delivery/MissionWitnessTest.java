package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.LongStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.MissionDossierSeal;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunEvidenceRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.MissionDossierSealRepository;
import com.taskforce.tf_api.core.repository.WebhookDeliveryRepository;
import com.taskforce.tf_api.core.service.GitHubPullRequests;
import com.taskforce.tf_api.core.service.webhook.WebhookDispatcher;
import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Le témoin (Q31, point 9 de la séance n°30) : à la fin de la mission, la tête de son dossier s'écrit dans sa pull
 * request, là où l'exploitant n'est pas seul à écrire ; un lien vers la page seulement pour un dépôt que GitHub dit privé,
 * jamais depuis l'app de bureau ni vers la machine elle-même (R159, B2 et M1) ; ce qui s'est passé entre au dossier, un
 * échec se retente, et un passage régulier rattrape un témoin perdu (R159, L7).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Le témoin du dossier, dans la pull request")
class MissionWitnessTest {

    private static final String ROOT = "sha256:" + "9".repeat(64);
    private static final String HEAD = "TaskForce evidence of this pull request: `" + ROOT + "` (event 31 of its record).";
    private static final String LINK = "0123456789abcdef0123456789abcdef";
    private static final String URL = "https://app.taskforce.dev/";
    /** Le compte du jeton de l'espace, dont le témoin écrit ses commentaires. */
    private static final String LOGIN = "acme-taskforce";
    private static final String HASH = "sha256:" + "4".repeat(64);

    @Mock private DeliveryRunRepository runRepository;
    @Mock private DeliveryRunEvidenceRepository evidenceRepository;
    @Mock private MissionDossierSealRepository sealRepository;
    @Mock private GitHubPullRequests pullRequests;
    @Mock private MissionEvidenceService evidence;
    @Mock private PlatformTransactionManager transactionManager;

    private DeliveryRun run;

    @BeforeEach
    void setUp() {
        Workspace workspace = Workspace.builder().id(1L).slug("acme").build();
        Project project = Project.builder().id(12L).workspace(workspace).build();
        run = DeliveryRun.builder().id(100L).issue(Issue.builder().id(55L).project(project).build()).status(DeliveryRunStatus.DONE)
            .resultUrl("https://github.com/acme/website/pull/212").build();
    }

    /** Le témoin d'un serveur, sans attente entre deux essais. */
    private MissionWitness witness(String frontendUrl, boolean linkAllowed) {
        return new MissionWitness(runRepository, evidenceRepository, sealRepository, pullRequests, evidence, transactionManager,
            frontendUrl, linkAllowed, List.of(Duration.ZERO, Duration.ZERO));
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> noted() {
        ArgumentCaptor<Map<String, Object>> data = (ArgumentCaptor) ArgumentCaptor.forClass(Map.class);
        verify(evidence).appendToDossier(eq(100L), eq("note"), eq(MissionEvidenceService.Actor.SERVER), data.capture());
        return data.getValue();
    }

    /** Les notes du témoin, exactement {@code count}, dans l'ordre (R159, troisième tour, c-d : au plus deux). */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private List<Map<String, Object>> notes(int count) {
        ArgumentCaptor<Map<String, Object>> data = (ArgumentCaptor) ArgumentCaptor.forClass(Map.class);
        verify(evidence, times(count)).appendToDossier(eq(100L), eq("note"), eq(MissionEvidenceService.Actor.SERVER), data.capture());
        return data.getAllValues();
    }

    private String written() {
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(pullRequests).comment(eq(1L), eq("acme/website"), eq(212), body.capture());
        return body.getValue();
    }

    @Test
    @DisplayName("un dépôt privé : la tête et le lien de la page, rien d'autre ; le dossier garde où le témoin est écrit")
    void a_private_repository_gets_the_head_and_the_link() {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.visibility(1L, "acme/website")).thenReturn(Optional.of("private"));
        when(pullRequests.comment(eq(1L), eq("acme/website"), eq(212), anyString()))
            .thenReturn(Optional.of("https://github.com/acme/website/pull/212#issuecomment-1"));
        when(evidence.linkId(100L)).thenReturn(LINK);

        witness(URL, true).write(new MissionSealed(100L, ROOT, 31));

        // R159, second tour, M-b : le lien ne porte qu'un identifiant opaque du dossier, ni l'espace ni la mission.
        assertThat(written()).isEqualTo(HEAD + "\nVerification page: https://app.taskforce.dev/verify/" + LINK)
            .doesNotContain("acme/missions").doesNotContain("100");
        assertThat(noted()).containsEntry("kind", "witness").containsEntry("where", "github-pull-request")
            .containsEntry("written", true).containsEntry("root", ROOT).containsEntry("seq", 31).containsEntry("pageLinked", true)
            .containsEntry("comment", "https://github.com/acme/website/pull/212#issuecomment-1").doesNotContainKey("pageLeftOut");
    }

    @ParameterizedTest(name = "visibilité {0} : la tête seule, et le dossier dit pourquoi ({1})")
    @CsvSource({"public, public-repository", "internal, internal-repository", "'', visibility-unknown"})
    void a_repository_not_known_private_gets_the_head_only(String visibility, String leftOut) {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.visibility(1L, "acme/website")).thenReturn(visibility.isEmpty() ? Optional.empty() : Optional.of(visibility));
        when(pullRequests.comment(eq(1L), eq("acme/website"), eq(212), anyString())).thenReturn(Optional.empty());

        witness(URL, true).write(new MissionSealed(100L, ROOT, 31));

        assertThat(written()).isEqualTo(HEAD);
        assertThat(noted()).containsEntry("written", true).containsEntry("pageLinked", false).containsEntry("pageLeftOut", leftOut);
    }

    @Test
    @DisplayName("l'app de bureau : jamais de lien, sans même demander la visibilité du dépôt")
    void the_desktop_app_never_links() {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.comment(eq(1L), eq("acme/website"), eq(212), anyString())).thenReturn(Optional.empty());

        witness("http://127.0.0.1:43123", false).write(new MissionSealed(100L, ROOT, 31));

        assertThat(written()).isEqualTo(HEAD);
        assertThat(noted()).containsEntry("pageLeftOut", "desktop-app");
        verify(pullRequests, never()).visibility(anyLong(), anyString());
    }

    @Test
    @DisplayName("une adresse de la machine elle-même : pas de lien, même pour un dépôt privé")
    void a_local_address_never_links() {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.comment(eq(1L), eq("acme/website"), eq(212), anyString())).thenReturn(Optional.empty());

        witness("http://localhost:3000", true).write(new MissionSealed(100L, ROOT, 31));

        assertThat(written()).isEqualTo(HEAD);
        assertThat(noted()).containsEntry("pageLeftOut", "local-address");
    }

    @ParameterizedTest(name = "{0} : locale={1}")
    @CsvSource({"http://localhost:3000, true", "http://app.localhost, true", "http://127.0.0.1:5173, true", "http://[::1]:8080, true",
        "http://0.0.0.0, true", "not a url, true", "https://app.taskforce.dev, false", "https://taskforce.intra.acme.fr, false"})
    void what_is_a_local_address(String url, boolean local) {
        assertThat(MissionWitness.local(url)).isEqualTo(local);
    }

    @Test
    @DisplayName("R159 troisième tour, c-d : GitHub refuse à chaque essai ; le premier échec entre au dossier, et le passage régulier le reprendra")
    void a_refusal_is_kept_in_the_dossier_and_tried_again_later() {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(evidence.appendToDossier(eq(100L), eq("note"), eq(MissionEvidenceService.Actor.SERVER), any())).thenReturn(Optional.of(HASH));
        when(pullRequests.comment(anyLong(), anyString(), anyInt(), anyString()))
            .thenThrow(new BusinessException("Connect GitHub in Settings > Integrations."));

        witness(URL, true).write(new MissionSealed(100L, ROOT, 31));

        verify(pullRequests, times(3)).comment(anyLong(), anyString(), anyInt(), anyString());
        assertThat(noted()).containsEntry("written", false).containsEntry("reason", "Connect GitHub in Settings > Integrations.")
            .containsEntry("retrying", true).doesNotContainKey("abandoned");
        verify(evidence).witnessTried(100L);
        verify(evidence, never()).witnessed(100L);
    }

    @Test
    @DisplayName("R159 troisième tour, c-d : GitHub ne dit pas s'il a écrit ; pas de second commentaire tout de suite, le passage régulier le trouve")
    void an_unanswered_comment_is_not_posted_again_and_the_sweep_finds_it() {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.login(1L)).thenReturn(LOGIN);
        when(evidence.appendToDossier(eq(100L), eq("note"), eq(MissionEvidenceService.Actor.SERVER), any())).thenReturn(Optional.of(HASH));
        when(evidence.witnessNoted(100L)).thenReturn(false, true);
        // Le commentaire s'est écrit, mais la liste de GitHub ne le montre pas encore.
        when(pullRequests.findComment(1L, "acme/website", 212, List.of(ROOT), LOGIN)).thenReturn(Optional.empty())
            .thenReturn(Optional.of("https://github.com/acme/website/pull/212#issuecomment-2"));
        when(pullRequests.comment(anyLong(), anyString(), anyInt(), anyString()))
            .thenThrow(new GitHubPullRequests.Unanswered("GitHub refused to comment on pull request #212 (HTTP 502)."));
        MissionWitness witness = witness(URL, true);

        witness.write(new MissionSealed(100L, ROOT, 31));

        verify(pullRequests, times(1)).comment(anyLong(), anyString(), anyInt(), anyString());
        verify(evidence, never()).witnessed(100L);
        verify(evidence).witnessTried(100L);

        when(evidenceRepository.findUnwitnessed(any(), any())).thenReturn(List.of(100L));
        when(sealRepository.findTopByRunIdOrderBySeqDesc(100L))
            .thenReturn(Optional.of(MissionDossierSeal.builder().runId(100L).seq(31).root(ROOT).build()));
        witness.pass();

        verify(pullRequests, times(1)).comment(anyLong(), anyString(), anyInt(), anyString());
        List<Map<String, Object>> notes = notes(2);
        assertThat(notes.get(0)).containsEntry("written", false).containsEntry("retrying", true)
            .containsEntry("reason", MissionWitness.UNANSWERED);
        assertThat(notes.get(1)).containsEntry("written", true)
            .containsEntry("comment", "https://github.com/acme/website/pull/212#issuecomment-2").doesNotContainKey("reason");
        verify(evidence).witnessed(100L);
    }

    @Test
    @DisplayName("GitHub ne répond pas une fois sans avoir rien écrit : le second essai écrit le témoin, une seule fois")
    void a_real_failure_is_retried_once() {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.comment(anyLong(), anyString(), anyInt(), anyString()))
            .thenThrow(new IllegalStateException("GitHub did not answer"))
            .thenReturn(Optional.of("https://github.com/acme/website/pull/212#issuecomment-3"));

        witness(URL, true).write(new MissionSealed(100L, ROOT, 31));

        verify(pullRequests, times(2)).findComment(eq(1L), eq("acme/website"), eq(212), eq(List.of(ROOT)), any());
        verify(pullRequests, times(2)).comment(anyLong(), anyString(), anyInt(), anyString());
        assertThat(noted()).containsEntry("written", true).doesNotContainKey("reason");
    }

    @Test
    @DisplayName("R159 troisième tour, c-d : seuls comptent les commentaires du compte du jeton, lu une fois, sur toutes les têtes scellées du dossier")
    void it_looks_for_its_own_comments_on_every_sealed_head() {
        String older = "sha256:" + "8".repeat(64);
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(sealRepository.findRootsByRunId(100L)).thenReturn(List.of(older, ROOT));
        when(pullRequests.login(1L)).thenReturn(LOGIN);
        when(pullRequests.findComment(1L, "acme/website", 212, List.of(older, ROOT), LOGIN))
            .thenThrow(new BusinessException("GitHub's answer for the comments of pull request #212 could not be read."))
            .thenReturn(Optional.of("https://github.com/acme/website/pull/212#issuecomment-5"));

        witness(URL, true).write(new MissionSealed(100L, ROOT, 31));

        // Une liste illisible est un échec : rien n'est posté sur un doute ; l'essai suivant la lit, et trouve le témoin.
        verify(pullRequests, never()).comment(anyLong(), anyString(), anyInt(), anyString());
        verify(pullRequests, times(1)).login(1L);
        assertThat(noted()).containsEntry("written", true).containsEntry("comment", "https://github.com/acme/website/pull/212#issuecomment-5");
    }

    @Test
    @DisplayName("R159 troisième tour, c-d : GitHub injoignable aux trois essais, puis à un passage ; le suivant écrit le témoin, et le dossier n'a que deux notes")
    void a_witness_github_prevents_is_tried_again_with_two_notes_at_most() {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(evidence.appendToDossier(eq(100L), eq("note"), eq(MissionEvidenceService.Actor.SERVER), any())).thenReturn(Optional.of(HASH));
        when(evidence.witnessNoted(100L)).thenReturn(false, true);
        BusinessException down = new GitHubPullRequests.Unanswered("GitHub can't be reached: nothing changed. Try again in a moment.");
        // Trois essais à la fin de la mission, puis un seul par passage (R159 de #551, quatrième tour, D1).
        when(pullRequests.login(1L)).thenThrow(down, down, down, down).thenReturn(LOGIN);
        when(pullRequests.comment(eq(1L), eq("acme/website"), eq(212), anyString()))
            .thenReturn(Optional.of("https://github.com/acme/website/pull/212#issuecomment-6"));
        when(evidenceRepository.findUnwitnessed(any(), any())).thenReturn(List.of(100L));
        when(sealRepository.findTopByRunIdOrderBySeqDesc(100L))
            .thenReturn(Optional.of(MissionDossierSeal.builder().runId(100L).seq(31).root(ROOT).build()));
        MissionWitness witness = witness(URL, true);

        witness.write(new MissionSealed(100L, ROOT, 31));
        witness.pass();
        witness.pass();

        verify(pullRequests, times(1)).comment(anyLong(), anyString(), anyInt(), anyString());
        List<Map<String, Object>> notes = notes(2);
        assertThat(notes.get(0)).containsEntry("written", false).containsEntry("retrying", true)
            .containsEntry("reason", "GitHub can't be reached: nothing changed. Try again in a moment.");
        assertThat(notes.get(1)).containsEntry("written", true).containsEntry("comment", "https://github.com/acme/website/pull/212#issuecomment-6");
        verify(evidence, times(2)).witnessTried(100L);
        verify(evidence, times(1)).witnessed(100L);
    }

    @Test
    @DisplayName("R159 troisième tour, c-d : ses sept jours passés, il cherche une dernière fois sans poster, puis le dossier dit qu'il abandonne")
    void after_seven_days_it_looks_once_more_then_gives_up() {
        when(evidenceRepository.findWitnessOverdue(any())).thenReturn(List.of(100L));
        when(sealRepository.findTopByRunIdOrderBySeqDesc(100L))
            .thenReturn(Optional.of(MissionDossierSeal.builder().runId(100L).seq(31).root(ROOT).build()));
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.login(1L)).thenReturn(LOGIN);

        witness(URL, true).pass();

        verify(pullRequests).findComment(1L, "acme/website", 212, List.of(ROOT), LOGIN);
        verify(pullRequests, never()).comment(anyLong(), anyString(), anyInt(), anyString());
        assertThat(noted()).containsEntry("written", false).containsEntry("abandoned", true)
            .containsEntry("reason", MissionWitness.GAVE_UP).doesNotContainKey("retrying");
        verify(evidence).witnessed(100L);
    }

    @Test
    @DisplayName("R159 troisième tour, c-d : ses sept jours passés, un témoin écrit à un essai d'avant se trouve encore")
    void after_seven_days_a_witness_written_before_is_found() {
        when(evidenceRepository.findWitnessOverdue(any())).thenReturn(List.of(100L));
        when(sealRepository.findTopByRunIdOrderBySeqDesc(100L))
            .thenReturn(Optional.of(MissionDossierSeal.builder().runId(100L).seq(31).root(ROOT).build()));
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.login(1L)).thenReturn(LOGIN);
        when(pullRequests.findComment(1L, "acme/website", 212, List.of(ROOT), LOGIN))
            .thenReturn(Optional.of("https://github.com/acme/website/pull/212#issuecomment-7"));

        witness(URL, true).pass();

        verify(pullRequests, never()).comment(anyLong(), anyString(), anyInt(), anyString());
        assertThat(noted()).containsEntry("written", true).containsEntry("comment", "https://github.com/acme/website/pull/212#issuecomment-7");
        verify(evidence).witnessed(100L);
    }

    @Test
    @DisplayName("R159 troisième tour, c-d et N2 : la note du premier échec ne s'écrit pas ; le témoin a fini, le passage régulier ne le reprend pas")
    void a_first_failure_that_is_not_kept_ends_the_attempts() {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(evidence.appendToDossier(eq(100L), eq("note"), eq(MissionEvidenceService.Actor.SERVER), any())).thenReturn(Optional.empty());
        when(pullRequests.comment(anyLong(), anyString(), anyInt(), anyString()))
            .thenThrow(new BusinessException("GitHub refused this account."));

        witness(URL, true).write(new MissionSealed(100L, ROOT, 31));

        assertThat(noted()).containsEntry("written", false).containsEntry("retrying", true);
        verify(evidence).witnessed(100L);
        verify(evidence, never()).witnessTried(anyLong());
    }

    @Test
    @DisplayName("R159 second tour, N6 : le commentaire porte aussi la clé qui a scellé la tête, et le dossier la note")
    void the_comment_carries_the_key() {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.comment(eq(1L), eq("acme/website"), eq(212), anyString())).thenReturn(Optional.empty());
        String key = "sha256:" + "e".repeat(64);

        witness("http://127.0.0.1:43123", false).write(new MissionSealed(100L, ROOT, 31, key));

        assertThat(written()).isEqualTo("TaskForce evidence of this pull request: `" + ROOT + "` (event 31 of its record), "
            + "sealed with the key `" + key + "`.");
        assertThat(noted()).containsEntry("key", key);
    }

    @Test
    @DisplayName("R159 second tour, M-b : l'exploitant a coupé le lien ; la tête seule, et le dossier dit pourquoi")
    void an_operator_can_turn_the_link_off() {
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.comment(eq(1L), eq("acme/website"), eq(212), anyString())).thenReturn(Optional.empty());

        witness(URL, false).write(new MissionSealed(100L, ROOT, 31));

        assertThat(written()).isEqualTo(HEAD);
        assertThat(noted()).containsEntry("pageLeftOut", "turned-off");
        verify(pullRequests, never()).visibility(anyLong(), anyString());
    }

    @Test
    @DisplayName("R159 second tour, N2 (sonde C) : la note ne s'écrit pas ; le témoin a fini quand même, et trois passages ne font qu'un commentaire")
    void a_note_that_is_not_kept_ends_the_attempts() {
        when(evidenceRepository.findUnwitnessed(any(), any())).thenReturn(List.of(100L));
        when(sealRepository.findTopByRunIdOrderBySeqDesc(100L))
            .thenReturn(Optional.of(MissionDossierSeal.builder().runId(100L).seq(31).root(ROOT).build()));
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(evidence.appendToDossier(eq(100L), eq("note"), eq(MissionEvidenceService.Actor.SERVER), any())).thenReturn(Optional.empty());
        when(pullRequests.findComment(eq(1L), eq("acme/website"), eq(212), eq(List.of(ROOT)), any())).thenReturn(Optional.empty())
            .thenReturn(Optional.of("https://github.com/acme/website/pull/212#issuecomment-4"));
        when(pullRequests.comment(eq(1L), eq("acme/website"), eq(212), anyString()))
            .thenReturn(Optional.of("https://github.com/acme/website/pull/212#issuecomment-4"));
        MissionWitness witness = witness(URL, true);

        witness.pass();
        witness.pass();
        witness.pass();

        verify(pullRequests, times(1)).comment(anyLong(), anyString(), anyInt(), anyString());
        verify(evidence, times(3)).witnessed(100L);
    }

    @Test
    @DisplayName("une mission sans pull request : rien ne s'écrit sur GitHub, une note le dit au dossier")
    void no_pull_request_says_so() {
        run.setResultUrl(null);
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));

        witness(URL, true).write(new MissionSealed(100L, ROOT, 31));

        verify(pullRequests, never()).comment(anyLong(), any(), anyInt(), any());
        assertThat(noted()).containsEntry("kind", "witness").containsEntry("written", false)
            .containsEntry("reason", "This mission has no pull request.");
    }

    @Test
    @DisplayName("la mission n'existe plus : rien ne s'écrit")
    void a_vanished_mission_writes_nothing() {
        when(runRepository.findById(100L)).thenReturn(Optional.empty());

        witness(URL, true).onSealed(new MissionSealed(100L, ROOT, 31));

        verify(pullRequests, never()).comment(anyLong(), any(), anyInt(), any());
        verify(evidence, never()).appendToDossier(any(), any(), any(), any());
    }

    @Test
    @DisplayName("R159, L7 : le passage régulier écrit le témoin d'une mission scellée qui n'en a pas, à sa dernière tête")
    void the_sweep_writes_a_lost_witness() {
        when(evidenceRepository.findUnwitnessed(any(), any())).thenReturn(List.of(100L));
        when(sealRepository.findTopByRunIdOrderBySeqDesc(100L))
            .thenReturn(Optional.of(MissionDossierSeal.builder().runId(100L).seq(31).root(ROOT).keyId("sha256:" + "e".repeat(64)).build()));
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        when(pullRequests.comment(eq(1L), eq("acme/website"), eq(212), anyString())).thenReturn(Optional.empty());

        witness(URL, true).pass();

        assertThat(written()).startsWith("TaskForce evidence of this pull request: `" + ROOT + "` (event 31 of its record), sealed with the key");
        assertThat(noted()).containsEntry("written", true).containsEntry("root", ROOT).containsEntry("seq", 31);
    }

    @Test
    @DisplayName("R159 de #551, quatrième tour, D1 : GitHub ne répond pas, cent missions attendent ; WebhookDispatcher passe quand même, et le passage s'arrête au premier délai")
    void a_github_that_does_not_answer_holds_neither_the_scheduler_nor_the_whole_pass() {
        when(evidenceRepository.findUnwitnessed(any(), any())).thenReturn(LongStream.rangeClosed(1, 100).boxed().toList());
        when(sealRepository.findTopByRunIdOrderBySeqDesc(anyLong()))
            .thenAnswer(call -> Optional.of(MissionDossierSeal.builder().runId(call.getArgument(0)).seq(31).root(ROOT).build()));
        when(runRepository.findById(anyLong())).thenReturn(Optional.of(run));
        when(evidence.appendToDossier(anyLong(), eq("note"), eq(MissionEvidenceService.Actor.SERVER), any())).thenReturn(Optional.of(HASH));
        // GitHub ne répond pas : chaque appel attend son délai, puis le client le dit.
        when(pullRequests.login(1L)).thenAnswer(call -> {
            Thread.sleep(300);
            throw new GitHubPullRequests.Unanswered("GitHub can't be reached: nothing changed. Try again in a moment.");
        });
        WebhookDeliveryRepository deliveries = mock(WebhookDeliveryRepository.class);
        WebhookDispatcher webhooks = new WebhookDispatcher(deliveries, new TransactionTemplate(transactionManager), 1000, false);
        MissionWitness witness = witness(URL, true);
        // Le planificateur du serveur : un seul fil, celui que donne @EnableScheduling sans réglage.
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.initialize();
        try {
            scheduler.scheduleWithFixedDelay(witness::sweep, Duration.ofMinutes(15));
            scheduler.scheduleWithFixedDelay(webhooks::dispatchDue, Duration.ofMillis(20));

            // Les webhooks partent pendant que le témoin attend GitHub.
            verify(deliveries, timeout(3000).atLeast(20)).lockDue(any(), anyInt());
            // Le premier délai arrête le passage : une mission essayée, une seule fois ; le passage suivant reprendra.
            verify(evidence, timeout(3000)).witnessTried(1L);
            verify(pullRequests, after(1000).times(1)).login(1L);
            verify(runRepository, never()).findById(2L);
        } finally {
            scheduler.shutdown();
            witness.stop();
        }
    }

    @Test
    @DisplayName("R159 de #551, quatrième tour, D1 : au passage régulier, un seul essai par mission et sans pause, quand GitHub refuse")
    void the_sweep_tries_each_mission_once_without_a_pause() {
        when(evidenceRepository.findUnwitnessed(any(), any())).thenReturn(List.of(100L, 101L));
        when(sealRepository.findTopByRunIdOrderBySeqDesc(anyLong()))
            .thenAnswer(call -> Optional.of(MissionDossierSeal.builder().runId(call.getArgument(0)).seq(31).root(ROOT).build()));
        when(runRepository.findById(anyLong())).thenReturn(Optional.of(run));
        when(evidence.appendToDossier(anyLong(), eq("note"), eq(MissionEvidenceService.Actor.SERVER), any())).thenReturn(Optional.of(HASH));
        // GitHub répond, et refuse : le passage passe à la mission suivante.
        when(pullRequests.login(1L)).thenThrow(new BusinessException("Reconnect GitHub in Settings > Integrations."));
        // Une minute de pause entre deux essais, à la fin d'une mission : le passage n'en fait aucune.
        MissionWitness witness = new MissionWitness(runRepository, evidenceRepository, sealRepository, pullRequests, evidence,
            transactionManager, URL, true, List.of(Duration.ofMinutes(1)));
        try {
            assertTimeoutPreemptively(Duration.ofSeconds(10), () -> {
                witness.sweep();
                verify(evidence, timeout(5000)).witnessTried(101L);
            });

            verify(pullRequests, times(2)).login(1L);
            verify(evidence).witnessTried(100L);
        } finally {
            witness.stop();
        }
    }

    @Test
    @DisplayName("le lien de la page suit l'adresse de l'app")
    void the_page_url_follows_the_app() {
        assertThat(new MissionWitness(runRepository, pullRequests, evidence, transactionManager, "https://tf.example.com/")
            .pageUrl(LINK)).isEqualTo("https://tf.example.com/verify/" + LINK);
    }
}
