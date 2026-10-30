package com.taskforce.tf_api.core.service.agent;

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

import com.taskforce.tf_api.core.enums.NodeRefType;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.IssueCommentRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * « Undo » sur ce que Cortex a créé (R77, séance n°13) : un projet resté vide, avec ses pages, ou une issue que personne
 * n'a commentée ; au-delà, rien ne se défait d'ici.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Défaire ce que Cortex a créé")
class CortexUndoTest {

    @Mock private ProjectService projectService;
    @Mock private ProjectRepository projects;
    @Mock private IssueService issueService;
    @Mock private IssueRepository issues;
    @Mock private IssueCommentRepository comments;
    @Mock private KnowledgeNodeRepository nodes;
    @Mock private KnowledgeService knowledge;

    private CortexUndo undo;
    private final AgentContext ctx = new AgentContext("acme", 1L, 7L);

    private static final String PROJECT_CREATED = "Project created in TaskForce: PRICING \"Pricing\" (id 27).";
    private static final String ISSUE_CREATED = "Created PRICING-3 \"Plan table\" in the project Pricing, in the column Backlog.";

    @BeforeEach
    void setUp() {
        undo = new CortexUndo(projectService, projects, issueService, issues, comments, nodes, knowledge);
    }

    private void project() {
        when(projects.findByIdAndWorkspaceId(27L, 1L))
            .thenReturn(Optional.of(Project.builder().id(27L).identifier("PRICING").name("Pricing").build()));
    }

    private static KnowledgeNode page(long id, Long refId) {
        return KnowledgeNode.builder().id(id).refId(refId).build();
    }

    @Test
    @DisplayName("un projet vide part avec les pages que le Brain OS lui a données")
    void an_empty_project_goes_with_its_pages() {
        project();
        when(nodes.findFirstByWorkspaceIdAndRefTypeAndRefId(1L, NodeRefType.PROJECT, 27L)).thenReturn(Optional.of(page(100, 27L)));
        when(nodes.findByWorkspaceIdAndParentNodeId(1L, 100L))
            .thenReturn(IntStream.rangeClosed(101, 106).mapToObj(id -> page(id, 27L)).toList());

        String done = undo.undo("create_project", PROJECT_CREATED, ctx);

        assertThat(done).isEqualTo("Removed the project PRICING \"Pricing\" and its 6 knowledge pages.");
        verify(knowledge, times(7)).deleteNode(any(), anyLong(), any());
        verify(projectService).deleteProject("acme", 27L, 7L);
    }

    @Test
    @DisplayName("un projet dont les pages ne sont pas encore écrites part seul")
    void a_project_without_its_pages_yet() {
        project();
        when(nodes.findFirstByWorkspaceIdAndRefTypeAndRefId(1L, NodeRefType.PROJECT, 27L)).thenReturn(Optional.empty());

        assertThat(undo.undo("create_project", PROJECT_CREATED, ctx)).isEqualTo("Removed the project PRICING \"Pricing\".");
        verify(projectService).deleteProject("acme", 27L, 7L);
    }

    @Test
    @DisplayName("un projet qui a des issues ne se défait plus d'ici")
    void a_project_with_issues_stays() {
        project();
        when(issues.countByProjectId(27L)).thenReturn(2L);

        assertThatThrownBy(() -> undo.undo("create_project", PROJECT_CREATED, ctx))
            .isInstanceOf(BusinessException.class).hasMessageContaining("PRICING has issues now");
        verify(projectService, never()).deleteProject(any(), any(), any());
        verify(knowledge, never()).deleteNode(any(), anyLong(), any());
    }

    @Test
    @DisplayName("une page ajoutée au projet le garde")
    void a_project_with_an_added_page_stays() {
        project();
        when(nodes.findFirstByWorkspaceIdAndRefTypeAndRefId(1L, NodeRefType.PROJECT, 27L)).thenReturn(Optional.of(page(100, 27L)));
        when(nodes.findByWorkspaceIdAndParentNodeId(1L, 100L)).thenReturn(List.of(page(101, 27L), page(150, null)));

        assertThatThrownBy(() -> undo.undo("create_project", PROJECT_CREATED, ctx))
            .isInstanceOf(BusinessException.class).hasMessageContaining("Pages were added to PRICING");
        verify(projectService, never()).deleteProject(any(), any(), any());
    }

    @Test
    @DisplayName("une issue que personne n'a commentée part")
    void an_uncommented_issue_goes() {
        when(projects.findByWorkspaceIdAndIdentifier(1L, "PRICING"))
            .thenReturn(Optional.of(Project.builder().id(27L).identifier("PRICING").build()));
        when(issues.findByProjectIdAndSequenceNumber(27L, 3))
            .thenReturn(Optional.of(Issue.builder().id(345L).sequenceNumber(3).title("Plan table").build()));

        assertThat(undo.undo("create_issue", ISSUE_CREATED, ctx)).isEqualTo("Removed PRICING-3 \"Plan table\".");
        verify(issueService).deleteIssue("acme", 27L, 345L, 7L);
    }

    @Test
    @DisplayName("une issue commentée ne se défait plus d'ici")
    void a_commented_issue_stays() {
        when(projects.findByWorkspaceIdAndIdentifier(1L, "PRICING"))
            .thenReturn(Optional.of(Project.builder().id(27L).identifier("PRICING").build()));
        when(issues.findByProjectIdAndSequenceNumber(27L, 3))
            .thenReturn(Optional.of(Issue.builder().id(345L).sequenceNumber(3).title("Plan table").build()));
        when(comments.countByIssueId(345L)).thenReturn(1L);

        assertThatThrownBy(() -> undo.undo("create_issue", ISSUE_CREATED, ctx))
            .isInstanceOf(BusinessException.class).hasMessageContaining("PRICING-3 has comments now");
        verify(issueService, never()).deleteIssue(any(), any(), any(), any());
    }

    @ParameterizedTest(name = "{0} : {1}")
    @CsvSource(delimiter = '|', value = {
        "create_project | Proposed                                    | created no project",
        "create_issue   | name is missing: a project needs a name.   | created no issue",
        "create_note    | Note created: \"T\" in PROJET (id 9).        | be undone",
    })
    void nothing_to_undo_in_this_output(String tool, String output, String message) {
        assertThatThrownBy(() -> undo.undo(tool, output, ctx))
            .isInstanceOf(BusinessException.class).hasMessageContaining(message);
    }

    @Test
    @DisplayName("seules la création d'un projet et celle d'une issue se défont")
    void only_projects_and_issues() {
        assertThat(undo.handles("create_project")).isTrue();
        assertThat(undo.handles("create_issue")).isTrue();
        assertThat(undo.handles("create_note")).isFalse();
    }
}
