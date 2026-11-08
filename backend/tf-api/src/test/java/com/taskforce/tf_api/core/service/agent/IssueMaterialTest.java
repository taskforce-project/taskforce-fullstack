package com.taskforce.tf_api.core.service.agent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.ChecklistItemResponse;
import com.taskforce.tf_api.core.dto.response.IssueActivityResponse;
import com.taskforce.tf_api.core.dto.response.IssueCommentResponse;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantRead;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.UserSummaryResponse;
import com.taskforce.tf_api.core.enums.IssueActivityType;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

/**
 * Ce que TaskForce lit d'une issue avant que Cortex la résume (test du CEO du 05/11/2026, OPS-35) : l'issue que la demande
 * nomme, avec les droits de la personne, et tout ce qu'elle dit, sous un plafond.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Ce que TaskForce lit d'une issue avant un résumé")
class IssueMaterialTest {

    @Mock private ProjectRepository projects;
    @Mock private IssueRepository issues;
    @Mock private ProjectVisibilityGuard visibility;
    @Mock private IssueService issueService;

    private IssueMaterial material;

    private static final Long ME = 7L;
    private static final Project OPS = Project.builder().id(30L).identifier("OPS").name("Ops").build();
    private static final Project HIDDEN = Project.builder().id(31L).identifier("SEC").name("Secret").build();
    private static final IssueStatusResponse DONE = IssueStatusResponse.builder().id(5L).name("Done").build();
    private static final UserSummaryResponse PIERRE = UserSummaryResponse.builder().id(ME).displayName("Pierre MICHEL").build();
    private static final LocalDateTime CREATED = LocalDateTime.of(2026, 10, 12, 9, 0);

    /** OPS-35 du seed de dev : « Itération #35 », rien d'autre. */
    private static IssueResponse.IssueResponseBuilder ops35() {
        return IssueResponse.builder().id(350L).projectId(30L).identifier("OPS-35").title("Itération #35").status(DONE)
            .priority(IssuePriority.MEDIUM).createdAt(CREATED).updatedAt(CREATED.plusDays(3));
    }

    @BeforeEach
    void setUp() {
        material = new IssueMaterial(projects, issues, visibility, issueService);
        lenient().when(projects.findByWorkspaceIdAndIdentifier(1L, "OPS")).thenReturn(Optional.of(OPS));
        lenient().when(projects.findByWorkspaceIdAndIdentifier(1L, "SEC")).thenReturn(Optional.of(HIDDEN));
        lenient().when(visibility.canView(OPS, ME)).thenReturn(true);
        lenient().when(visibility.canView(HIDDEN, ME)).thenReturn(false);
        lenient().when(issues.findByProjectIdAndSequenceNumber(30L, 35)).thenReturn(Optional.of(Issue.builder().id(350L).build()));
        lenient().when(issues.findByProjectIdAndSequenceNumber(30L, 36)).thenReturn(Optional.of(Issue.builder().id(360L).build()));
        lenient().when(issues.findByProjectIdAndSequenceNumber(31L, 1)).thenReturn(Optional.of(Issue.builder().id(900L).build()));
    }

    private static AgentContext ctx(Long openIssue) {
        return new AgentContext("acme", 1L, ME, openIssue == null ? Screen.NONE : new Screen(30L, openIssue), "x");
    }

    /**
     * L'issue que la demande nomme : sa clé, écrite avec son tiret ou une espace, parmi les projets que la personne voit ;
     * sans clé, l'issue ouverte, sauf quand la demande parle du projet ou du tableau.
     */
    @ParameterizedTest(name = "« {0} », issue ouverte {1} : {2}")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
        "prend OPS-35 et propose moi un resume dans les commentaire stp | -   | 350",
        "résume ops 35                                                   | -   | 350",
        "résume OPS-35 et OPS-36                                         | -   | 350,360",
        "résume OPS-35 et OPS-35                                         | -   | 350",
        "résume SEC-1                                                    | -   | -",
        "résume OPS-99                                                   | -   | -",
        "résume cette issue                                              | 360 | 360",
        "résume le projet                                                | 360 | -",
        "fais le point sur le tableau                                    | 360 | -",
        "résume OPS-35                                                   | 360 | 350",
        "résume dans 2 jours                                             | -   | -",
    })
    void the_issue_the_request_names(String request, Long open, String expected) {
        List<Long> named = new ArrayList<>(material.named(ctx(open), request).keySet());

        assertThat(named).containsExactlyElementsOf(expected == null ? List.of()
            : java.util.Arrays.stream(expected.split(",")).map(Long::valueOf).toList());
    }

    @Test
    @DisplayName("OPS-35, qui ne dit que son titre : le bloc le dit, et la consigne de ne rien ajouter est en tête")
    void an_issue_that_says_little_says_so() {
        when(issueService.getIssue("acme", 30L, 350L, ME)).thenReturn(ops35().build());
        when(issueService.listChecklist("acme", 30L, 350L, ME)).thenReturn(List.of());
        when(issueService.listComments("acme", 30L, 350L, ME)).thenReturn(List.of());
        when(issueService.listActivity("acme", 30L, 350L, ME)).thenReturn(List.of(IssueActivityResponse.builder()
            .actor(PIERRE).action(IssueActivityType.CREATED).createdAt(CREATED).build()));

        String block = material.describe(ctx(null), "prend OPS-35 et propose moi un resume dans les commentaire stp");

        assertThat(block).isEqualTo(IssueMaterial.HEADER
            + "OPS-35 \"Itération #35\": in Done, unassigned, priority medium. Created 12 Oct 2026, last changed 15 Oct 2026.\n"
            + "Description: none.\n"
            + "Checklist: none.\n"
            + "Comments: none.\n"
            + "Activity, oldest first: 12 Oct 2026, Pierre MICHEL created it.\n");
        assertThat(IssueMaterial.HEADER).contains("summarize only from it").contains("say so in one sentence");
    }

    @Test
    @DisplayName("tout ce que l'issue dit : sa description, sa checklist, ses commentaires (par qui), son activité")
    void everything_the_issue_says() {
        IssueResponse issue = ops35().title("Migrer la base").description("Passer à Postgres 18.\n\nSans coupure.")
            .assignee(PIERRE).storyPoints(5).build();
        List<ChecklistItemResponse> checklist = List.of(
            ChecklistItemResponse.builder().id(1L).content("Sauvegarde").done(true).build(),
            ChecklistItemResponse.builder().id(2L).content("Bascule").done(false).build());
        List<IssueCommentResponse> comments = List.of(IssueCommentResponse.builder().id(1L).author(PIERRE)
            .content("Fenêtre le 20/11").via("qwen3:8b").createdAt(CREATED.plusDays(1)).build());
        List<IssueActivityResponse> activity = List.of(IssueActivityResponse.builder().actor(PIERRE)
            .action(IssueActivityType.STATUS_CHANGED).oldValue("Todo").newValue("Done").createdAt(CREATED.plusDays(2)).build());

        String text = IssueMaterial.text(issue, checklist, comments, activity);

        assertThat(text).contains("OPS-35 \"Migrer la base\": in Done, assigned to Pierre MICHEL, priority medium, 5 points.")
            .contains("Description: Passer à Postgres 18. Sans coupure.\n")
            .contains("Checklist, 1 of 2 done: [x] Sauvegarde; [ ] Bascule\n")
            .contains("- Pierre MICHEL via qwen3:8b, 13 Oct 2026: \"Fenêtre le 20/11\"\n")
            .contains("Activity, oldest first: 14 Oct 2026, Pierre MICHEL moved it from Todo to Done.");
    }

    @Test
    @DisplayName("un plafond : les plus anciens commentaires tombent d'abord, et le bloc le dit")
    void a_long_issue_keeps_its_last_comments() {
        List<IssueCommentResponse> comments = IntStream.range(0, 30).mapToObj(i -> IssueCommentResponse.builder()
            .id((long) i).author(PIERRE).content("Commentaire " + i + " " + "x".repeat(380)).createdAt(CREATED).build())
            .toList();

        String text = IssueMaterial.text(ops35().build(), List.of(), comments, List.of());

        assertThat(text.length()).isLessThanOrEqualTo(IssueMaterial.MAX_CHARS + 1);
        assertThat(text).contains("Commentaire 29").doesNotContain("Commentaire 0 ").contains("(the last ");
    }

    @Test
    @DisplayName("une issue qui ne se lit pas (ou plus) : rien n'en est dit, et rien ne casse")
    void an_unreadable_issue_says_nothing() {
        when(issueService.getIssue("acme", 30L, 350L, ME)).thenThrow(new ResourceNotFoundException("Issue not found"));

        assertThat(material.describe(ctx(null), "résume OPS-35")).isEmpty();
        assertThat(material.describe(ctx(null), "")).isEmpty();
        verify(issueService, never()).listComments(anyString(), anyLong(), anyLong(), any());
    }

    private void ops35WithComments(int count) {
        when(issueService.getIssue("acme", 30L, 350L, ME)).thenReturn(ops35().build());
        when(issueService.listChecklist("acme", 30L, 350L, ME)).thenReturn(List.of());
        when(issueService.listComments("acme", 30L, 350L, ME)).thenReturn(IntStream.range(0, count)
            .mapToObj(i -> IssueCommentResponse.builder().id((long) i).author(PIERRE).content("Point " + i).createdAt(CREATED).build())
            .toList());
        when(issueService.listActivity("acme", 30L, 350L, ME)).thenReturn(List.of());
    }

    @Test
    @DisplayName("la ligne grise (R123) : chaque issue lue, avec les commentaires vraiment donnés au modèle")
    void what_was_read_is_counted() {
        ops35WithComments(3);

        IssueMaterial.Read read = material.read(ctx(null), "résume OPS-35", List.of(), true);

        assertThat(read.text()).startsWith(IssueMaterial.HEADER).contains("Point 2");
        assertThat(read.issues()).containsExactly(new AssistantRead.IssueRead("OPS-35", 3));
    }

    @Test
    @DisplayName("une issue jointe par la personne (R123) : lue sans demande de résumé, sous le titre de ce qu'elle a joint")
    void an_attached_issue_is_read_without_a_summary() {
        ops35WithComments(1);

        IssueMaterial.Read read = material.read(ctx(null), "qui devrait la prendre ?", List.of(new Screen(30L, 350L)), false);

        assertThat(read.text()).startsWith(IssueMaterial.ATTACHED).contains("OPS-35 \"Itération #35\"");
        assertThat(read.issues()).containsExactly(new AssistantRead.IssueRead("OPS-35", 1));
        // Hors d'un résumé, la clé écrite dans la demande ne fait rien lire de plus.
        verify(issueService, never()).getIssue("acme", 30L, 360L, ME);
    }

    @Test
    @DisplayName("jointe et nommée : lue une fois ; un projet joint (sans issue) n'est pas une issue ; rien sans pièce")
    void an_issue_attached_and_named_is_read_once() {
        ops35WithComments(0);

        IssueMaterial.Read read = material.read(ctx(null), "résume OPS-35",
            List.of(new Screen(30L, 350L), new Screen(30L, null)), true);

        assertThat(read.issues()).containsExactly(new AssistantRead.IssueRead("OPS-35", 0));
        verify(issueService).getIssue("acme", 30L, 350L, ME);
        assertThat(material.read(ctx(null), "bonjour", null, false)).isSameAs(IssueMaterial.Read.NOTHING);
        assertThat(IssueMaterial.Read.NOTHING.isEmpty()).isTrue();
    }
}
