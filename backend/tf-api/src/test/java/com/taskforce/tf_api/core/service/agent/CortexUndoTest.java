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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.NodeRefType;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.IssueCommentRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.KnowledgeEdgeRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.mcpserver.IssueGestures;
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
 * « Undo » sur ce que Cortex a créé (R77, séance n°13) : un projet resté vide, avec ses pages, une issue que personne
 * n'a commentée, ou une note sur laquelle rien ne s'appuie ; au-delà, rien ne se défait d'ici.
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
    @Mock private KnowledgeEdgeRepository edges;
    @Mock private KnowledgeService knowledge;
    @Mock private IssueGestures gestures;

    private CortexUndo undo;
    private final AgentContext ctx = new AgentContext("acme", 1L, 7L);

    private static final String PROJECT_CREATED = "Project created in TaskForce: PRICING \"Pricing\" (id 27).";
    private static final String ISSUE_CREATED = "Created PRICING-3 \"Plan table\" in the project Pricing, in the column Backlog.";
    private static final String NOTE_CREATED = "Note created: \"Pricing ideas\" in PRODUIT (id 9).";

    @BeforeEach
    void setUp() {
        undo = new CortexUndo(projectService, projects, issueService, issues, comments, nodes, edges, knowledge, gestures);
    }

    private void note() {
        when(nodes.findByIdAndWorkspaceId(9L, 1L)).thenReturn(Optional.of(KnowledgeNode.builder().id(9L).title("Pricing ideas").build()));
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
    @DisplayName("la clé d'un projet peut porter un tiret : l'issue HR-1372-3 se défait aussi")
    void an_issue_of_a_project_key_with_a_hyphen_goes() {
        when(projects.findByWorkspaceIdAndIdentifier(1L, "HR-1372"))
            .thenReturn(Optional.of(Project.builder().id(28L).identifier("HR-1372").build()));
        when(issues.findByProjectIdAndSequenceNumber(28L, 3))
            .thenReturn(Optional.of(Issue.builder().id(346L).sequenceNumber(3).title("Check").build()));

        assertThat(undo.undo("create_issue", "Created HR-1372-3 \"Check\" in the project Harness, in the column Backlog.", ctx))
            .isEqualTo("Removed HR-1372-3 \"Check\".");
        verify(issueService).deleteIssue("acme", 28L, 346L, 7L);
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

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
        "Note created: \"Pricing ideas\" in PRODUIT (id 9).",
        "Note created: \"Pricing ideas\" in PROJET (id 9). Its type is NOTE: TEST is not a note type.",
    })
    @DisplayName("une note sur laquelle rien ne s'appuie part, même quand une valeur inconnue a été remplacée")
    void a_note_nothing_builds_on_goes(String output) {
        note();
        when(nodes.findByWorkspaceIdAndParentNodeId(1L, 9L)).thenReturn(List.of());

        assertThat(undo.undo("create_note", output, ctx)).isEqualTo("Removed the note \"Pricing ideas\".");
        verify(knowledge).deleteNode("acme", 9L, 7L);
    }

    @Test
    @DisplayName("une note qui a une page rangée dessous ne se défait plus d'ici")
    void a_note_with_a_page_under_it_stays() {
        note();
        when(nodes.findByWorkspaceIdAndParentNodeId(1L, 9L)).thenReturn(List.of(page(12, null)));

        assertThatThrownBy(() -> undo.undo("create_note", NOTE_CREATED, ctx))
            .isInstanceOf(BusinessException.class).hasMessageContaining("\"Pricing ideas\" has pages under it now");
        verify(knowledge, never()).deleteNode(any(), anyLong(), any());
    }

    @Test
    @DisplayName("une note vers laquelle une autre mène ne se défait plus d'ici")
    void a_note_another_links_to_stays() {
        note();
        when(nodes.findByWorkspaceIdAndParentNodeId(1L, 9L)).thenReturn(List.of());
        when(edges.existsByToNodeId(9L)).thenReturn(true);

        assertThatThrownBy(() -> undo.undo("create_note", NOTE_CREATED, ctx))
            .isInstanceOf(BusinessException.class).hasMessageContaining("Other notes link to \"Pricing ideas\" now");
        verify(knowledge, never()).deleteNode(any(), anyLong(), any());
    }

    @Test
    @DisplayName("une note déjà supprimée n'a plus rien à défaire")
    void a_deleted_note() {
        when(nodes.findByIdAndWorkspaceId(9L, 1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> undo.undo("create_note", NOTE_CREATED, ctx))
            .isInstanceOf(BusinessException.class).hasMessageContaining("This note no longer exists");
    }

    @ParameterizedTest(name = "{0} : {1}")
    @CsvSource(delimiter = '|', value = {
        "create_project | Proposed                                    | created no project",
        "create_issue   | name is missing: a project needs a name.   | created no issue",
        "create_note    | Proposed                                    | created no note",
        "update_issue   | Updated PRICING-3.                          | be undone",
    })
    void nothing_to_undo_in_this_output(String tool, String output, String message) {
        assertThatThrownBy(() -> undo.undo(tool, output, ctx))
            .isInstanceOf(BusinessException.class).hasMessageContaining(message);
    }

    @ParameterizedTest(name = "{0} se défait : {1}")
    @CsvSource({
        "create_project, true", "create_issue, true", "create_note, true", "update_issue, true", "add_comment, true",
        // Une mission lancée ne se défait pas d'ici : Cortex la demande d'abord (TF-J1-5).
        "delegate_issue, false", "get_mission, false",
    })
    @DisplayName("les créations et les gestes sur une issue se défont, pas une mission lancée")
    void what_can_be_undone(String tool, boolean undoable) {
        assertThat(undo.handles(tool)).isEqualTo(undoable);
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({"update_issue, Put back the column of TF-12.", "add_comment, Removed the comment on TF-12."})
    @DisplayName("un geste se défait par ce qu'il a gardé au dossier, avec les droits de la personne")
    void a_gesture_is_undone_by_what_it_kept(String tool, String said) throws Exception {
        JsonNode kept = new ObjectMapper().readTree("{\"tool\": \"" + tool + "\", \"status\": \"success\", "
            + "\"output\": \"Updated TF-12\", \"undo\": {\"projectId\": 12, \"issueId\": 5}}");
        if ("update_issue".equals(tool)) when(gestures.restore("acme", 7L, kept.get("undo"))).thenReturn(said);
        else when(gestures.removeComment("acme", 7L, kept.get("undo"))).thenReturn(said);

        assertThat(undo.undo(tool, kept, ctx)).isEqualTo(said);
    }

    @Test
    void a_creation_is_still_undone_by_its_output() throws Exception {
        project();
        JsonNode kept = new ObjectMapper().readTree("{\"tool\": \"create_project\", \"status\": \"success\", \"output\": "
            + new ObjectMapper().writeValueAsString(PROJECT_CREATED) + "}");

        assertThat(undo.undo("create_project", kept, ctx)).startsWith("Removed the project PRICING");
    }

    /**
     * Le geste du MCP (R115) garde le projet créé : sa phrase peut dire aussi son dépôt. Un dépôt créé avec lui reste
     * sur GitHub, et la phrase le dit.
     */
    @ParameterizedTest(name = "dépôt créé {0}")
    @CsvSource(nullValues = "-", value = {
        "-,          Removed the project PRICING \"Pricing\".",
        "acme/pricing, Removed the project PRICING \"Pricing\". Its repository acme/pricing stays on GitHub: delete it there if you want it gone.",
    })
    void a_project_of_the_gesture_is_undone_by_what_it_kept(String repository, String said) throws Exception {
        project();
        String kept = "{\"tool\": \"create_project\", \"status\": \"success\", \"output\": \"Project created in TaskForce: "
            + "PRICING \\\"Pricing\\\" (id 27). Its new private repository x/y is linked.\", \"undo\": {\"projectId\": 27"
            + (repository == null ? "" : ", \"createdRepository\": \"" + repository + "\"") + "}}";

        assertThat(undo.undo("create_project", new ObjectMapper().readTree(kept), ctx)).isEqualTo(said);
        verify(projectService).deleteProject("acme", 27L, 7L);
    }
}
