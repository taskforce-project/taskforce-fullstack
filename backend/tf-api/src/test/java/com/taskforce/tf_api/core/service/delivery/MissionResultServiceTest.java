package com.taskforce.tf_api.core.service.delivery;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest;
import com.taskforce.tf_api.core.enums.DeliveryRunOutcome;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.GitHubLinkStatus;
import com.taskforce.tf_api.core.enums.GitHubLinkType;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueGitHubLink;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.IssueGitHubLinkRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.GitHubPullRequests;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.MergedPullRequests;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Les trois gestes de la carte de résultat (R78, séance n°13) : appliquer, écarter, relancer. Seule la personne qui a
 * délégué tranche, une fois, sur une mission finie avec un résultat.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Carte de résultat : Apply, Discard, Try again")
class MissionResultServiceTest {

    @Mock private DeliveryRunRepository runRepository;
    @Mock private UserRepository userRepository;
    @Mock private IssueGitHubLinkRepository linkRepository;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private GitHubPullRequests pullRequests;
    @Mock private MergedPullRequests mergedPullRequests;
    @Mock private IssueService issueService;
    @Mock private DeliveryService deliveryService;

    private MissionResultService service;
    private User delegator;
    private DeliveryRun run;
    private IssueGitHubLink link;

    @BeforeEach
    void setUp() {
        service = new MissionResultService(runRepository, userRepository, linkRepository, visibilityGuard, pullRequests,
            mergedPullRequests, issueService, deliveryService);
        delegator = User.builder().id(7L).email("ada@taskforce.dev").build();
        Workspace workspace = Workspace.builder().id(1L).slug("acme").build();
        Project project = Project.builder().id(12L).workspace(workspace).build();
        Issue issue = Issue.builder().id(55L).title("Fix the footer links").project(project).build();
        run = DeliveryRun.builder().id(100L).issue(issue).providerKey("claude-code").model("sonnet")
            .status(DeliveryRunStatus.DONE).startedBy(delegator)
            .resultUrl("https://github.com/acme/website/pull/212").branch("tf/web-28").build();
        link = IssueGitHubLink.builder().issue(issue).linkType(GitHubLinkType.PR).repoFullName("acme/website").prNumber(212)
            .status(GitHubLinkStatus.OPEN).build();
        lenient().when(runRepository.findByIdForUpdate(100L)).thenReturn(Optional.of(run));
        lenient().when(userRepository.getReferenceById(7L)).thenReturn(delegator);
        lenient().when(linkRepository.findByIssueIdOrderByLinkedAtDesc(55L)).thenReturn(List.of(link));
    }

    @Test
    @DisplayName("Apply : la pull request est fusionnée, son lien suit, l'issue est terminée, le geste est gardé")
    void apply_merges_and_completes_the_issue() {
        service.apply("acme", 100L, 7L);

        verify(pullRequests).merge(1L, "acme/website", 212);
        assertThat(link.getStatus()).isEqualTo(GitHubLinkStatus.MERGED);
        assertThat(run.getOutcome()).isEqualTo(DeliveryRunOutcome.APPLIED);
        assertThat(run.getOutcomeBy()).isEqualTo(delegator);
        assertThat(run.getOutcomeAt()).isNotNull();
        verify(mergedPullRequests).completeIssue(55L, 7L);
    }

    @Test
    @DisplayName("Apply sans pull request : rien ne se fusionne, le résultat reste à trancher")
    void apply_without_a_pull_request() {
        run.setResultUrl(null);

        assertThatThrownBy(() -> service.apply("acme", 100L, 7L))
            .isInstanceOf(BusinessException.class).hasMessageContaining("no pull request to apply");
        verify(pullRequests, never()).merge(anyLong(), any(), anyInt());
        assertThat(run.getOutcome()).isNull();
    }

    @Test
    @DisplayName("GitHub refuse la fusion : rien n'est gardé, l'issue reste où elle est")
    void a_refused_merge_keeps_nothing() {
        doThrow(new BusinessException("GitHub can't merge pull request #212")).when(pullRequests).merge(1L, "acme/website", 212);

        assertThatThrownBy(() -> service.apply("acme", 100L, 7L)).isInstanceOf(BusinessException.class);
        assertThat(run.getOutcome()).isNull();
        verify(mergedPullRequests, never()).completeIssue(any(), any());
    }

    @Test
    @DisplayName("Discard : la pull request est fermée, sa branche supprimée, le geste gardé")
    void discard_closes_and_deletes_the_branch() {
        service.discard("acme", 100L, 7L);

        verify(pullRequests).close(1L, "acme/website", 212);
        verify(pullRequests).deleteBranch(1L, "acme/website", "tf/web-28");
        assertThat(link.getStatus()).isEqualTo(GitHubLinkStatus.CLOSED);
        assertThat(run.getOutcome()).isEqualTo(DeliveryRunOutcome.DISCARDED);
    }

    @Test
    @DisplayName("Discard sans pull request : le résultat est seulement écarté")
    void discard_without_a_pull_request() {
        run.setResultUrl(null);

        service.discard("acme", 100L, 7L);

        verify(pullRequests, never()).close(anyLong(), any(), anyInt());
        assertThat(run.getOutcome()).isEqualTo(DeliveryRunOutcome.DISCARDED);
    }

    @Test
    @DisplayName("Try again : le résultat est écarté, la remarque va sur l'issue, une nouvelle mission part")
    void retry_posts_the_note_and_delegates_again() {
        service.retry("acme", 100L, 7L, "  Keep the old link for Privacy.  ");

        verify(pullRequests).close(1L, "acme/website", 212);
        ArgumentCaptor<CreateIssueCommentRequest> comment = ArgumentCaptor.forClass(CreateIssueCommentRequest.class);
        verify(issueService).addComment(eq("acme"), eq(12L), eq(55L), comment.capture(), eq(7L));
        assertThat(comment.getValue().getContent()).isEqualTo("Try again: Keep the old link for Privacy.");
        verify(deliveryService).delegate("acme", 55L, "claude-code", "sonnet", 7L);
        assertThat(run.getOutcome()).isEqualTo(DeliveryRunOutcome.RETRIED);
    }

    @Test
    @DisplayName("Try again sans remarque : rien n'est posté, la mission repart")
    void retry_without_a_note() {
        service.retry("acme", 100L, 7L, " ");

        verify(issueService, never()).addComment(any(), any(), any(), any(), any());
        verify(deliveryService).delegate("acme", 55L, "claude-code", "sonnet", 7L);
    }

    @Test
    @DisplayName("un coéquipier ne tranche pas pour la personne qui a délégué")
    void only_the_delegator_decides() {
        assertThatThrownBy(() -> service.apply("acme", 100L, 8L)).isInstanceOf(ForbiddenException.class);
        verify(pullRequests, never()).merge(anyLong(), any(), anyInt());
    }

    @ParameterizedTest(name = "statut {0}, geste {1} : refusé")
    @CsvSource({
        "RUNNING, ",
        "FAILED,  ",
        "DONE,    APPLIED",
        "DONE,    DISCARDED",
    })
    void a_result_is_decided_once(DeliveryRunStatus status, DeliveryRunOutcome outcome) {
        run.setStatus(status);
        run.setOutcome(outcome);

        assertThatThrownBy(() -> service.discard("acme", 100L, 7L)).isInstanceOf(BusinessException.class);
        verify(pullRequests, never()).close(anyLong(), any(), anyInt());
    }

    @Test
    @DisplayName("une mission d'un autre espace n'existe pas d'ici")
    void a_run_of_another_workspace_is_not_found() {
        assertThatThrownBy(() -> service.apply("other", 100L, 7L)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("il faut pouvoir écrire dans le projet")
    void writing_the_project_is_required() {
        doThrow(new ForbiddenException("read only")).when(visibilityGuard).assertCanWrite(run.getIssue().getProject(), 7L);

        assertThatThrownBy(() -> service.apply("acme", 100L, 7L)).isInstanceOf(ForbiddenException.class);
        verify(pullRequests, never()).merge(anyLong(), any(), anyInt());
    }
}
