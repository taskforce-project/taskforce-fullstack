package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.dto.response.UserSummaryResponse;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Ce que Cortex voit de l'écran (R114, séance n°17) : le projet ouvert, ses colonnes avec leurs issues, l'issue ouverte,
 * rien que ce que la personne voit, et sous un plafond qui tient dans la mémoire d'un petit modèle.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("L'écran que Cortex voit")
class ScreenContextTest {

    @Mock private ProjectService projectService;
    @Mock private IssueService issueService;

    private ScreenContext screens;

    private static final ProjectResponse PROJECT = ProjectResponse.builder().id(12L).identifier("TESTTA").name("test taskforce").build();
    private static final IssueStatusResponse TODO = column(2L, "Todo", 1);
    private static final IssueStatusResponse REVIEW = column(4L, "In review by AI", 2);
    private static final IssueStatusResponse DONE = column(5L, "Done", 3);
    private static final IssueStatusResponse BACKLOG = column(1L, "Backlog", 0);
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 2, 15, 0);

    private static IssueStatusResponse column(Long id, String name, int position) {
        return IssueStatusResponse.builder().id(id).name(name).position((short) position).category(IssueStatusCategory.STARTED).build();
    }

    private static IssueResponse issue(long id, String key, String title, IssueStatusResponse column, int hoursAgo) {
        return IssueResponse.builder().id(id).identifier(key).title(title).status(column).updatedAt(NOW.minusHours(hoursAgo)).build();
    }

    /** Le projet test-taskforce de la Présidence, le 02/11/2026 : trois issues, dont TESTTA-2 dans « In review by AI ». */
    private static final List<IssueResponse> CEO_BOARD = List.of(
        issue(21L, "TESTTA-1", "Ajouter la version LTS actuelle de Node.js au README", DONE, 30),
        issue(22L, "TESTTA-2", "Ajouter la version LTS actuelle de Node.js au README", REVIEW, 2),
        issue(23L, "TESTTA-3", "Corriger le login", TODO, 5));

    @BeforeEach
    void setUp() {
        screens = new ScreenContext(projectService, issueService);
        lenient().when(projectService.getProject("acme", 12L, 7L)).thenReturn(PROJECT);
        lenient().when(issueService.listStatuses("acme", 12L, 7L)).thenReturn(List.of(TODO, REVIEW, DONE, BACKLOG));
        lenient().when(issueService.listIssues("acme", 12L, 7L)).thenReturn(CEO_BOARD);
    }

    private static AgentContext seeing(Long projectId, Long issueId) {
        return new AgentContext("acme", 1L, 7L, new Screen(projectId, issueId));
    }

    @Test
    @DisplayName("le tableau de la Présidence : chaque colonne avec ses issues, dans l'ordre du tableau")
    void the_board_shows_each_column_with_its_issues() {
        String text = screens.describe(seeing(12L, null));

        assertThat(text).isEqualTo("""
            On screen, what the person sees now. When they say "this", "it" or name an issue by its column or its title, \
            it is one of these: use its key.
            Project TESTTA "test taskforce".
            Columns, with their issues:
            - Backlog: none
            - Todo: TESTTA-3 Corriger le login
            - In review by AI: TESTTA-2 Ajouter la version LTS actuelle de Node.js au README
            - Done: TESTTA-1 Ajouter la version LTS actuelle de Node.js au README
            """);
    }

    @Test
    @DisplayName("l'issue ouverte : sa clé, son titre, sa colonne et son assigné")
    void the_open_issue_says_its_column_and_assignee() {
        IssueResponse open = issue(22L, "TESTTA-2", "Ajouter la version LTS actuelle de Node.js au README", REVIEW, 2);
        open.setAssignee(UserSummaryResponse.builder().id(7L).displayName("Pierre MICHEL").build());
        when(issueService.getIssue("acme", 12L, 22L, 7L)).thenReturn(open);

        assertThat(screens.describe(seeing(12L, 22L))).endsWith("Open issue: TESTTA-2 \"Ajouter la version LTS actuelle de "
            + "Node.js au README\", in In review by AI, assigned to Pierre MICHEL.\n");
    }

    @Test
    @DisplayName("rien sans écran : aucune lecture")
    void nothing_without_a_screen() {
        assertThat(screens.describe(new AgentContext("acme", 1L, 7L))).isEmpty();
        verifyNoInteractions(projectService, issueService);
    }

    /** Rien que ce que la personne voit : un projet qu'elle ne voit pas (privé, d'un autre espace) ne montre rien. */
    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"forbidden", "not found"})
    void a_project_out_of_sight_shows_nothing(String why) {
        when(projectService.getProject("acme", 99L, 7L)).thenThrow("forbidden".equals(why)
            ? new ForbiddenException("Private project") : new ResourceNotFoundException("Project not found"));

        assertThat(screens.describe(seeing(99L, 5L))).isEmpty();
        verify(issueService, never()).listIssues(any(), any(), any());
    }

    @Test
    @DisplayName("une issue ouverte qu'elle ne lit pas dans ce projet ne se montre pas ; le tableau, si")
    void an_open_issue_out_of_sight_is_left_out() {
        when(issueService.getIssue("acme", 12L, 77L, 7L)).thenThrow(new ResourceNotFoundException("Issue not found"));

        String text = screens.describe(seeing(12L, 77L));

        assertThat(text).contains("TESTTA-2").doesNotContain("Open issue");
    }

    @Test
    @DisplayName("au plus vingt issues, les dernières changées, et un plafond de caractères ; une archivée ne compte pas")
    void at_most_twenty_issues_under_a_size_cap() {
        List<IssueResponse> many = new ArrayList<>(IntStream.range(0, 46)
            .mapToObj(i -> issue(100L + i, "WEB-" + i, "A long title for the issue number " + i + " that keeps going on and on",
                i % 2 == 0 ? TODO : DONE, i))
            .toList());
        many.add(IssueResponse.builder().id(999L).identifier("WEB-999").title("Archived").status(TODO).archived(true)
            .updatedAt(NOW).build());
        when(issueService.listIssues("acme", 12L, 7L)).thenReturn(many);

        String text = screens.describe(seeing(12L, null));

        assertThat(text.length()).isLessThanOrEqualTo(ScreenContext.MAX_CHARS);
        assertThat(text).contains("WEB-0 ", "WEB-1 ").doesNotContain("WEB-45", "WEB-999", "Archived")
            .contains("of its 46 issues").contains("The other issues: list_issues reads them.");
        long shown = text.lines().filter(line -> line.startsWith("- ")).mapToLong(line -> line.split("WEB-").length - 1).sum();
        assertThat(shown).isBetween(1L, (long) ScreenContext.MAX_ISSUES);
        // Un titre long se coupe : la clé et le début suffisent.
        assertThat(text).doesNotContain("keeps going on and on");
    }
}
