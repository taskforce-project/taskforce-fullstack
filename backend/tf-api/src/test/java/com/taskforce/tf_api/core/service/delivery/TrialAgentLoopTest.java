package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest;
import com.taskforce.tf_api.core.dto.request.RunnerEventsRequest;
import com.taskforce.tf_api.core.dto.response.ChecklistItemResponse;
import com.taskforce.tf_api.core.dto.response.IssueCommentResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.UserSummaryResponse;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.security.DelegatedAgent;
import com.taskforce.tf_api.core.service.AiMeter;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.core.service.brain.BrainViewer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * La boucle minimale de l'agent à l'essai (R51) : elle lit l'issue avec les droits de la personne, fait écrire la
 * réponse au modèle, la poste en commentaire sous le nom du modèle, pour la personne, si la règle de l'espace le permet,
 * puis clôt la mission ; refusée, demandée ou vide, rien ne part.
 */
@DisplayName("Agent à l'essai : la boucle minimale")
class TrialAgentLoopTest {

    private final DeliveryRunRepository runRepository = mock(DeliveryRunRepository.class);
    private final IssueService issueService = mock(IssueService.class);
    private final BrainSearchService search = mock(BrainSearchService.class);
    private final BrainAccessGuard access = mock(BrainAccessGuard.class);
    private final HarnessRulesService rulesService = mock(HarnessRulesService.class);
    private final LlmClient llm = mock(LlmClient.class);
    private final AiMeter meter = mock(AiMeter.class);
    private final DeliveryActivityService activity = mock(DeliveryActivityService.class);
    private final MissionEvidenceService evidence = mock(MissionEvidenceService.class);
    private final DeliveryRunner runner = mock(DeliveryRunner.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<DeliveryRunner> runnerProvider = mock(ObjectProvider.class);

    private TrialAgentLoop loop;
    private DeliveryRun run;
    private final AtomicReference<String> commentedVia = new AtomicReference<>();

    @BeforeEach
    void mission() throws Exception {
        loop = new TrialAgentLoop(runRepository, issueService, search, access, rulesService, llm, meter, activity, evidence,
            runnerProvider, new TransactionTemplate(mock(PlatformTransactionManager.class)));
        Workspace acme = Workspace.builder().id(1L).slug("acme").build();
        Project testta = Project.builder().id(3L).workspace(acme).identifier("TESTTA").name("Test").build();
        Issue issue = Issue.builder().id(55L).project(testta).sequenceNumber(4).title("Triage the feedback").build();
        User pierre = User.builder().id(7L).email("pierre@acme.dev").displayName("Pierre").build();
        run = DeliveryRun.builder().id(90L).issue(issue).providerKey(TrialAgentProvider.KEY).model("qwen3:8b")
            .status(DeliveryRunStatus.RUNNING).startedBy(pierre).build();
        when(runRepository.findById(90L)).thenReturn(Optional.of(run));
        when(runnerProvider.getObject()).thenReturn(runner);
        rules("allow");

        IssueResponse view = IssueResponse.builder().id(55L).identifier("TESTTA-4").title("Triage the feedback")
            .description("Five pieces of feedback from the beta.").priority(IssuePriority.HIGH).projectName("Test")
            .status(IssueStatusResponse.builder().name("To Do").build()).build();
        lenient().when(issueService.getIssue("acme", 3L, 55L, 7L)).thenReturn(view);
        lenient().when(issueService.listChecklist("acme", 3L, 55L, 7L)).thenReturn(List.of(
            ChecklistItemResponse.builder().id(1L).content("Group by theme").done(true).build()));
        lenient().when(issueService.listComments("acme", 3L, 55L, 7L)).thenReturn(List.of(
            IssueCommentResponse.builder().id(2L).content("The export is the worst.").via("Claude Code")
                .author(UserSummaryResponse.builder().displayName("Marie").email("marie@acme.dev").build())
                .createdAt(LocalDateTime.of(2026, 11, 3, 9, 0)).build()));
        lenient().when(issueService.listIssues("acme", 3L, 7L)).thenReturn(List.of(view,
            IssueResponse.builder().id(56L).identifier("TESTTA-5").title("Fix the export")
                .status(IssueStatusResponse.builder().name("Blocked").build()).build()));
        lenient().when(access.viewer(1L, 7L)).thenReturn(new BrainViewer(1L, false, List.of(3L)));
        lenient().when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of(
            KnowledgeNode.builder().title("Beta plan").domain(NodeDomain.PROJET).content("The beta ends on 20 November.").build()));
        lenient().when(meter.metered(eq(1L), any())).thenAnswer(call -> ((AiMeter.AiCall<?>) call.getArgument(1)).call());
        lenient().when(issueService.addComment(eq("acme"), eq(3L), eq(55L), any(), eq(7L))).thenAnswer(call -> {
            commentedVia.set(DelegatedAgent.current().orElse(null));
            return IssueCommentResponse.builder().id(3L).build();
        });
    }

    @AfterEach
    void stop() {
        loop.stop();
    }

    private void rules(String effect) {
        RulesBundle.Rule comment = new RulesBundle.Rule("comment",
            new RulesBundle.Condition("comment.create", null, null, null, null, null, null, null), "reversible-exit",
            effect, null, "workspace-owner", "A comment is deleted in one gesture.", null);
        when(rulesService.bundleFor(any())).thenReturn(new RulesBundle(RulesBundle.FORMAT, "acme", null, 3,
            "sha256:" + "a".repeat(64), null, List.of(comment)));
    }

    private void answers(String content) {
        when(llm.rawChatWithModel(any(), eq(List.of()), eq("qwen3:8b")))
            .thenReturn(new ObjectMapper().createObjectNode().put("role", "assistant").put("content", content));
    }

    private DeliveryPoll finished() {
        ArgumentCaptor<DeliveryPoll> poll = ArgumentCaptor.forClass(DeliveryPoll.class);
        verify(runner).complete(eq(90L), poll.capture());
        return poll.getValue();
    }

    private List<String> kinds() {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<RunnerEventsRequest.Event>> events = ArgumentCaptor.forClass(List.class);
        verify(activity, org.mockito.Mockito.atLeastOnce()).appendEvents(any(), events.capture());
        return events.getAllValues().stream().flatMap(List::stream).map(RunnerEventsRequest.Event::kind).toList();
    }

    @Test
    @DisplayName("arrêtée pendant l'appel au modèle : rien n'est posté (R138)")
    void postsNothingOnceStopped() throws Exception {
        when(llm.rawChatWithModel(any(), eq(List.of()), eq("qwen3:8b"))).thenAnswer(call -> {
            run.setStatus(DeliveryRunStatus.FAILED);
            return new ObjectMapper().createObjectNode().put("role", "assistant").put("content", "Too late.");
        });

        loop.run(90L);

        verify(issueService, never()).addComment(any(), any(), any(), any(), any());
        verify(runner, never()).complete(any(), any());
    }

    @Test
    @DisplayName("la règle permet : le commentaire part sur l'issue confiée, sous le nom du modèle, et la mission se clôt")
    void postsTheAnswerAsAComment() throws Exception {
        answers("Three themes: export, speed, onboarding. The export comes first.");

        loop.run(90L);

        ArgumentCaptor<CreateIssueCommentRequest> comment = ArgumentCaptor.forClass(CreateIssueCommentRequest.class);
        verify(issueService).addComment(eq("acme"), eq(3L), eq(55L), comment.capture(), eq(7L));
        assertThat(comment.getValue().getContent()).isEqualTo("Three themes: export, speed, onboarding. The export comes first.");
        assertThat(commentedVia.get()).isEqualTo("qwen3:8b");
        DeliveryPoll poll = finished();
        assertThat(poll.status()).isEqualTo(DeliveryRunStatus.DONE);
        assertThat(poll.summary()).isEqualTo("qwen3:8b answered in a comment on TESTTA-4.");
        assertThat(kinds()).containsExactly("start", "tool", "decision", "text");
        verify(runRepository).recordRules(90L, 3, "sha256:" + "a".repeat(64));
        verify(evidence).append(eq(run), eq("mission.started"), eq(MissionEvidenceService.Actor.SERVER), any());

        // Le modèle lit l'issue, sa liste, ses commentaires, les autres issues et les notes ; jamais l'issue deux fois.
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Map<String, Object>>> messages = ArgumentCaptor.forClass(List.class);
        verify(llm).rawChatWithModel(messages.capture(), eq(List.of()), eq("qwen3:8b"));
        String task = (String) messages.getValue().get(1).get("content");
        assertThat(task).contains("The issue TESTTA-4: Triage the feedback", "Column: To Do · Priority: high",
            "- [x] Group by theme", "Marie (through Claude Code), 3 Nov: The export is the worst.",
            "- TESTTA-5 Fix the export (Blocked)", "Beta plan: The beta ends on 20 November.");
        assertThat(task).doesNotContain("- TESTTA-4");
        assertThat((String) messages.getValue().get(0).get("content")).startsWith("You are qwen3:8b, an agent of TaskForce "
            + "working for Pierre.");
    }

    @Test
    @DisplayName("la règle refuse : rien ne part, la mission est refusée et le dit")
    void aDeniedCommentIsNotPosted() {
        rules("deny");
        answers("An answer.");

        loop.run(90L);

        verify(issueService, never()).addComment(anyString(), anyLong(), anyLong(), any(), anyLong());
        assertThat(run.isRefused()).isTrue();
        DeliveryPoll poll = finished();
        assertThat(poll.status()).isEqualTo(DeliveryRunStatus.FAILED);
        assertThat(poll.error()).startsWith("The rules of this workspace refuse a comment, so nothing was posted.");
        assertThat(kinds()).containsExactly("start", "tool", "decision", "denied");
    }

    @Test
    @DisplayName("la règle demande : rien ne part, l'essai ne sait pas encore attendre une réponse")
    void anAskedCommentIsNotPosted() {
        rules("ask");
        answers("An answer.");

        loop.run(90L);

        verify(issueService, never()).addComment(anyString(), anyLong(), anyLong(), any(), anyLong());
        assertThat(run.isRefused()).isFalse();
        assertThat(finished().error()).contains("ask before a comment");
    }

    @Test
    @DisplayName("une réponse vide, ou un modèle en panne : rien ne part, la mission échoue et dit pourquoi")
    void nothingIsPostedWithoutAnAnswer() {
        answers("   ");

        loop.run(90L);

        verify(issueService, never()).addComment(anyString(), anyLong(), anyLong(), any(), anyLong());
        assertThat(finished().error()).isEqualTo("qwen3:8b wrote no answer, so nothing was posted on TESTTA-4.");
    }

    @Test
    @DisplayName("le modèle ne répond pas : la mission échoue, rien n'est posté")
    void aModelFailureEndsTheMission() {
        when(llm.rawChatWithModel(any(), any(), anyString())).thenThrow(new IllegalStateException("AI provider unreachable."));

        loop.run(90L);

        verify(issueService, never()).addComment(anyString(), anyLong(), anyLong(), any(), anyLong());
        assertThat(finished().error()).isEqualTo("qwen3:8b stopped: AI provider unreachable. Nothing was posted.");
        assertThat(kinds()).contains("error");
    }

    @Test
    @DisplayName("un run qui ne court plus : rien ne se lit ni ne s'écrit")
    void aRunThatStoppedIsLeftAlone() {
        run.setStatus(DeliveryRunStatus.DONE);

        loop.run(90L);

        verify(llm, never()).rawChatWithModel(any(), any(), anyString());
        verify(runner, never()).complete(anyLong(), any());
    }

    @Test
    @DisplayName("un run lancé par ce backend est connu ; un autre est perdu")
    void knowsTheRunsItStarted() {
        when(runRepository.findById(91L)).thenReturn(Optional.empty());

        loop.start(91L, "trial:known");

        assertThat(loop.knows("trial:known")).isTrue();
        assertThat(loop.knows("trial:other")).isFalse();
    }
}
