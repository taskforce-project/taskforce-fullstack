package com.taskforce.tf_api.core.service.agent;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.mcp.ExternalMcpTool;
import com.taskforce.tf_api.core.service.mcp.McpClient;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * Le noyau pour Cortex (R35) : chaque outil de Cortex est jugé par les règles de l'espace, avec le moteur et le
 * contrat des actions d'un agent délégué. Les règles par défaut d'abord, puis celles qu'un espace écrit.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Règles de l'espace devant les outils de Cortex")
class CortexGateTest {

    @Mock private HarnessRuleSetRepository ruleSets;
    @Mock private WorkspaceRepository workspaces;

    private final ObjectMapper json = new ObjectMapper();
    private CortexGate gate;
    private RulesBundle defaults;

    @BeforeEach
    void defaultRules() {
        gate = new CortexGate(new HarnessRulesService(ruleSets), workspaces);
        Workspace ws = Workspace.builder().id(1L).slug("acme").name("Acme")
            .owner(User.builder().email("owner@acme.test").build()).build();
        when(workspaces.findById(1L)).thenReturn(Optional.of(ws));
        defaults = gate.rulesFor(new AgentContext("acme", 1L, 7L));
    }

    private static AgentTool internal(String name) {
        AgentTool tool = Mockito.mock(AgentTool.class);
        when(tool.name()).thenReturn(name);
        return tool;
    }

    private ExternalMcpTool external(String server, boolean readOnly) throws Exception {
        var def = new McpClient.ToolDef("save_issue", "saves an issue", json.readTree("{\"type\":\"object\"}"), readOnly);
        return new ExternalMcpTool(Mockito.mock(McpClient.class), new McpClient.ServerRef(server, "http://x/mcp", null), def, json);
    }

    private static RulesBundle.Rule rule(String id, String action, String server, String effect, String reason) {
        return new RulesBundle.Rule(id, new RulesBundle.Condition(action, null, null, null, null, null, server, null),
            "irreversible", effect, null, "owner@acme.test", reason, "2027-01-31");
    }

    private static RulesBundle bundle(RulesBundle.Rule... rules) {
        return new RulesBundle(RulesBundle.FORMAT, "acme", null, 2, "sha256:" + "a".repeat(64), null, List.of(rules));
    }

    @ParameterizedTest(name = "{0} : {1}, règle {2}")
    @CsvSource({
        "search_brain,     allow, search-knowledge",
        "list_projects,    allow, read-issues",
        "list_issues,      allow, read-issues",
        "find_integration, allow, read-company-tools",
        "create_issue,     allow, create-issue",      // se défait : une issue se ferme d'un geste
        "create_note,      allow, create-note",       // la Présidence, 30/10/2026 : la note comme un projet, avec « Undo »
        "create_project,   allow, create-project",    // la Présidence, 30/10/2026 : Cortex crée le projet demandé
        "make_coffee,      ask,",                     // un outil inconnu n'a pas d'action : demandé
    })
    void the_default_rules_judge_every_internal_tool(String name, String effect, String ruleId) {
        CortexGate.Verdict verdict = gate.judge(defaults, internal(name));

        assertThat(verdict.effect()).isEqualTo(effect);
        assertThat(verdict.ruleId()).isEqualTo(ruleId);
        assertThat(verdict.facts()).containsEntry("tool", name);
    }

    @Test
    @DisplayName("une action qu'aucune règle ne couvre attend la personne, et le dit")
    void an_uncovered_action_waits_for_the_person() {
        CortexGate.Verdict verdict = gate.judge(bundle(), internal("create_project"));

        assertThat(verdict.allowed()).isFalse();
        assertThat(verdict.denied()).isFalse();
        assertThat(verdict.reason()).isEqualTo("No rule of this workspace covers this action, so it waits for the person.");
        assertThat(verdict.facts()).containsEntry("action", "project.create");
    }

    @ParameterizedTest(name = "outil externe, lecture seule {0} : {1}")
    @CsvSource({
        "true,  allow, mcp.read,  read-company-tools",
        "false, ask,   mcp.write, write-company-tools",
    })
    void an_external_tool_is_judged_by_what_it_does(boolean readOnly, String effect, String action, String ruleId) throws Exception {
        CortexGate.Verdict verdict = gate.judge(defaults, external("linear", readOnly));

        assertThat(verdict.effect()).isEqualTo(effect);
        assertThat(verdict.ruleId()).isEqualTo(ruleId);
        assertThat(verdict.facts())
            .containsEntry("action", action).containsEntry("server", "linear").containsEntry("tool", "linear__save_issue");
    }

    @ParameterizedTest(name = "écrire dans {0} : {1}")
    @CsvSource({
        "linear, deny", // la règle de l'espace vise ce serveur
        "notion, ask",  // ailleurs, la règle générale tient
    })
    void a_workspace_rule_can_target_one_server(String server, String effect) throws Exception {
        RulesBundle rules = bundle(
            rule("write-company-tools", "mcp.write", null, "ask", "Unknown inverse."),
            rule("no-linear-writes", "mcp.write", "linear", "deny", "Linear is read-only for agents."));

        assertThat(gate.judge(rules, external(server, false)).effect()).isEqualTo(effect);
    }

    @Test
    @DisplayName("refuser l'emporte sur autoriser, et la règle qui refuse donne sa raison")
    void deny_wins_and_gives_its_reason() {
        RulesBundle rules = bundle(
            rule("create-issue", "issue.create", null, "allow", "An issue is closed in one gesture."),
            rule("release-freeze", "issue.create", null, "deny", "No new issue until the release."));

        CortexGate.Verdict verdict = gate.judge(rules, internal("create_issue"));

        assertThat(verdict.denied()).isTrue();
        assertThat(verdict.ruleId()).isEqualTo("release-freeze");
        assertThat(verdict.reason()).isEqualTo("No new issue until the release.");
    }

    @Test
    @DisplayName("un outil sans nom n'a ni action ni règle : il attend la personne")
    void a_tool_without_a_name_waits() {
        AgentTool nameless = Mockito.mock(AgentTool.class);

        CortexGate.Verdict verdict = gate.judge(defaults, nameless);

        assertThat(verdict.effect()).isEqualTo("ask");
        assertThat(verdict.facts()).containsExactlyEntriesOf(Map.of("tool", ""));
    }

    @Test
    @DisplayName("un espace introuvable n'a pas de règles : rien n'est jugé")
    void unknown_workspace() {
        when(workspaces.findById(2L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> gate.rulesFor(new AgentContext("gone", 2L, 7L)))
            .isInstanceOf(ResourceNotFoundException.class);
    }
}
