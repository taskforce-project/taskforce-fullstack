package com.taskforce.tf_api.core.service.mcpserver;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
import com.taskforce.tf_api.core.service.brain.BrainSearchService;

import static org.assertj.core.api.Assertions.assertThat;
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
            mock(BrainSearchService.class), mock(AnalyticsService.class), mock(AgentService.class), gestures);
        lenient().when(gestures.withIds(eq("acme"), eq(7L), any())).thenAnswer(inv -> inv.getArgument(2));
    }

    private AgentTool tool(String name) {
        return mcp.forCortex().stream().filter(t -> t.name().equals(name)).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("Cortex reçoit les gestes, chacun avec l'action que la table de règles juge")
    void cortex_gets_the_gestures_with_their_action() {
        assertThat(mcp.forCortex()).extracting(AgentTool::name)
            .containsExactly("update_issue", "add_comment", "delegate_issue", "delete_issue", "get_mission");
        assertThat(mcp.forCortex()).extracting(AgentTool::action)
            .containsExactly("issue.update", "comment.create", "mission.start", "issue.delete", "issue.read");
        assertThat(mcp.forCortex()).allMatch(CortexGesture.class::isInstance);
    }

    @Test
    @DisplayName("Cortex nomme l'issue par sa clé : les ids ne lui sont pas montrés")
    @SuppressWarnings("unchecked")
    void cortex_names_the_issue_by_its_key() {
        Map<String, Object> schema = tool("update_issue").parametersSchema();

        Map<String, Object> properties = (Map<String, Object>) schema.get("properties");
        assertThat(properties).containsKeys("issue", "status", "assignee", "addLabels", "points", "cycle", "dueDate")
            .doesNotContainKeys("projectId", "issueId", "statusId", "assigneeId");
        assertThat((List<String>) schema.get("required")).containsExactly("issue");
        assertThat((List<String>) tool("add_comment").parametersSchema().get("required")).containsExactly("issue", "content");
        // Le schéma du serveur MCP, lui, garde les ids d'un agent délégué.
        assertThat(mcp.find("update_issue").orElseThrow().inputSchema().path("properties").has("issueId")).isTrue();
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
        assertThat(registry.all()).hasSize(5);
    }
}
