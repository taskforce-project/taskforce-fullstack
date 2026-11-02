package com.taskforce.tf_api.core.service.mcpserver;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

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
import com.taskforce.tf_api.core.security.DelegatedAgent;
import com.taskforce.tf_api.core.service.AnalyticsService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.SmartAssignService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentService;
import com.taskforce.tf_api.core.service.agent.AgentTool;
import com.taskforce.tf_api.core.service.agent.AgentToolRegistry;
import com.taskforce.tf_api.core.service.agent.CortexGesture;
import com.taskforce.tf_api.core.service.agent.QuestionNeeded;
import com.taskforce.tf_api.core.service.agent.Screen;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Une seule surface d'outils (ADR-024) : les gestes du MCP TaskForce tels que Cortex s'en sert, au nom de la personne,
 * jugés sur l'action que chacun porte, et nommant l'issue par sa clé.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Les gestes du MCP TaskForce pour Cortex")
class CortexMcpToolTest {

    @Mock private IssueGestures gestures;

    private final ObjectMapper mapper = new ObjectMapper();
    private TaskforceMcpTools mcp;
    private final AgentContext ctx = new AgentContext("acme", 1L, 7L);

    @BeforeEach
    void setUp() {
        mcp = new TaskforceMcpTools(mapper, mock(ProjectService.class), mock(IssueService.class), mock(SmartAssignService.class),
            mock(BrainSearchService.class), mock(AnalyticsService.class), mock(AgentService.class), gestures, projects);
        lenient().when(gestures.withIds(eq("acme"), eq(7L), any())).thenAnswer(inv -> inv.getArgument(2));
        lenient().when(gestures.issueOf(eq("acme"), eq(7L), any(), any(), any())).thenAnswer(inv -> inv.getArgument(3));
    }

    @Mock private ProjectGestures projects;

    private AgentTool tool(String name) {
        return mcp.forCortex().stream().filter(t -> t.name().equals(name)).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("Cortex reçoit les gestes, chacun avec l'action que la table de règles juge")
    void cortex_gets_the_gestures_with_their_action() {
        assertThat(mcp.forCortex()).extracting(AgentTool::name)
            .containsExactly("update_issue", "add_comment", "delegate_issue", "delete_issue", "get_mission", "create_project");
        assertThat(mcp.forCortex()).extracting(AgentTool::action)
            .containsExactly("issue.update", "comment.create", "mission.start", "issue.delete", "issue.read", "project.create");
        assertThat(mcp.forCortex()).allMatch(CortexGesture.class::isInstance);
    }

    @Test
    @DisplayName("Cortex nomme l'issue par sa clé : les ids ne lui sont pas montrés, et ce que TaskForce demande n'est pas exigé")
    @SuppressWarnings("unchecked")
    void cortex_names_the_issue_by_its_key() {
        Map<String, Object> schema = tool("update_issue").parametersSchema();

        Map<String, Object> properties = (Map<String, Object>) schema.get("properties");
        assertThat(properties).containsKeys("issue", "status", "assignee", "addLabels", "points", "cycle", "dueDate")
            .doesNotContainKeys("projectId", "issueId", "statusId", "assigneeId");
        // R115 : l'issue et le commentaire, TaskForce les demande quand la demande ne les dit pas ; le modèle n'invente rien.
        assertThat(schema).doesNotContainKey("required");
        assertThat(tool("add_comment").parametersSchema()).doesNotContainKey("required");
        // Le schéma du serveur MCP, lui, garde les ids d'un agent délégué, et le commentaire exigé.
        assertThat(mcp.find("update_issue").orElseThrow().inputSchema().path("properties").has("issueId")).isTrue();
        assertThat(mcp.find("add_comment").orElseThrow().inputSchema().path("required").toString()).contains("content");
    }

    /** Chaque geste de Cortex déclare ce qu'il exige, et son défaut sûr quand il en a un (R115). */
    @ParameterizedTest(name = "{0} : {1}")
    @CsvSource(delimiter = '|', quoteCharacter = '"', value = {
        "update_issue   | issue?",
        "add_comment    | issue?, content?",
        "delegate_issue | issue?, agent=Claude Code",
        "delete_issue   | issue?",
        "get_mission    | issue?",
        "create_project | name? (when), repository? (when), repositoryVisibility?=private (when), identifier=from the name, "
            + "visibility=the project's members only",
    })
    void each_gesture_declares_what_it_needs(String name, String needs) {
        String declared = mcp.find(name).orElseThrow().needs().stream()
            .map(need -> need.field() + (need.isAsked() ? "?" : "") + (need.safeDefault() == null ? "" : "=" + need.safeDefault())
                + (need.when() == null ? "" : " (when)"))
            .collect(java.util.stream.Collectors.joining(", "));
        assertThat(declared).isEqualTo(needs);
    }

    @Test
    @DisplayName("R115 : un commentaire sans texte se demande, en réponse libre, avant le geste")
    void a_comment_without_its_text_is_asked() {
        CortexGesture comment = (CortexGesture) tool("add_comment");

        assertThatThrownBy(() -> comment.ask(Map.of("issue", "TF-12"), ctx))
            .isInstanceOfSatisfying(QuestionNeeded.class, needed -> {
                assertThat(needed.question().field()).isEqualTo("content");
                assertThat(needed.question().text()).isEqualTo("What should the comment say?");
                assertThat(needed.question().choices()).isEmpty();
            });
        assertThat(comment.ask(Map.of("issue", "TF-12", "content", "Done in #12"), ctx))
            .containsEntry("content", "Done in #12");
    }

    @Test
    @DisplayName("R115 : l'issue se résout parmi celles de l'écran, qui va avec chaque appel")
    void the_issue_is_resolved_with_the_screen() {
        AgentContext seeing = new AgentContext("acme", 1L, 7L, new Screen(12L, 5L));
        when(gestures.issueOf(eq("acme"), eq(7L), eq(new Screen(12L, 5L)), any(), eq("Which issue should be deleted?")))
            .thenReturn(mapper.createObjectNode().put("issue", "TF-12").put("projectId", 12).put("issueId", 5));

        Map<String, Object> resolved = ((CortexGesture) tool("delete_issue")).ask(Map.of("issue", "the open one"), seeing);

        assertThat(resolved).containsEntry("issue", "TF-12").containsEntry("issueId", 5);
    }

    @Test
    @DisplayName("créer un projet passe par le geste du MCP, au nom de la personne, et garde de quoi le défaire")
    void creating_a_project_goes_through_the_mcp_gesture() {
        when(projects.create(eq("acme"), eq(7L), any())).thenReturn(new IssueGestures.Gesture(
            "Project created in TaskForce: ATLAS \"Atlas\" (id 31).", null, List.of(), Map.of(), Map.of("projectId", 31L)));

        CortexGesture.Done done = ((CortexGesture) tool("create_project")).perform(Map.of("name", "Atlas"), ctx);

        assertThat(done.text()).startsWith("Project created in TaskForce: ATLAS");
        assertThat(done.target()).isNull();
        assertThat(done.undo()).containsEntry("projectId", 31L);
    }

    @Test
    @DisplayName("le geste se fait au nom de la personne, et l'activité dit « Cortex »")
    void the_gesture_runs_as_the_person_through_cortex() {
        AtomicReference<String> via = new AtomicReference<>();
        when(gestures.update(eq("acme"), eq(7L), any())).thenAnswer(inv -> {
            via.set(DelegatedAgent.current().orElse(null));
            JsonNode args = inv.getArgument(2);
            return new IssueGestures.Gesture("Updated " + args.path("issue").asText(), Map.of("issueId", 5), List.of(),
                Map.of(), Map.of("fields", Map.of()));
        });

        CortexGesture.Done done = ((CortexGesture) tool("update_issue")).perform(Map.of("issue", "TF-12", "status", "Done"), ctx);

        assertThat(done.text()).isEqualTo("Updated TF-12");
        assertThat(done.target()).containsEntry("issueId", 5);
        assertThat(done.undo()).containsKey("fields");
        assertThat(via.get()).isEqualTo("Cortex");
        assertThat(DelegatedAgent.current()).isEmpty(); // hors du geste, personne n'agit pour la personne
        assertThat(tool("update_issue").execute(Map.of("issue", "TF-12"), ctx)).isEqualTo("Updated TF-12");
    }

    @Test
    @DisplayName("la carte d'une suppression dit ce qui partirait, sans rien supprimer")
    void the_card_of_a_deletion_says_what_goes() {
        when(gestures.preview(eq("delete_issue"), eq("acme"), eq(7L), any())).thenReturn(new IssueGestures.Gesture(
            "Deleting TF-12 removes it for good.", Map.of("issueId", 5, "comments", 2), List.of(), Map.of(), null));

        CortexGesture.Done card = ((CortexGesture) tool("delete_issue")).preview(Map.of("issue", "TF-12"), ctx);

        assertThat(card.text()).isEqualTo("Deleting TF-12 removes it for good.");
        assertThat(card.target()).containsEntry("comments", 2);
        assertThat(card.undo()).isNull();
        org.mockito.Mockito.verify(gestures, org.mockito.Mockito.never()).delete(any(), any(), any());
    }

    @Test
    @DisplayName("le registre de Cortex ajoute les gestes à ses outils, qui gardent la priorité sur un nom partagé")
    void the_registry_adds_the_gestures_after_cortex_tools() {
        AgentTool own = mock(AgentTool.class);
        when(own.name()).thenReturn("update_issue");

        AgentToolRegistry registry = new AgentToolRegistry(List.of(own), mcp);

        assertThat(registry.get("update_issue")).isSameAs(own);
        assertThat(registry.get("delegate_issue")).isInstanceOf(CortexGesture.class);
        assertThat(registry.get("create_project")).isInstanceOf(CortexGesture.class);
        assertThat(registry.all()).hasSize(6);
    }
}
