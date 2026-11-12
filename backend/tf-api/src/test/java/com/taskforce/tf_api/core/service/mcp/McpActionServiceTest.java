package com.taskforce.tf_api.core.service.mcp;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.ConnectionScope;
import com.taskforce.tf_api.core.enums.ToolClass;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.agent.CortexGate;
import com.taskforce.tf_api.core.service.agent.CortexRecordService;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires - {@link McpActionService} : la console d'actions passe par les règles de l'espace et entre au
 * dossier comme tout autre geste (séance n°22, R157 et R158).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("McpActionService (la console, par le moteur et le dossier)")
class McpActionServiceTest {

    private static final UUID RECORD = UUID.fromString("00000000-0000-0000-0000-0000000000dd");

    @Mock private WorkspaceMcpService workspaceMcp;
    @Mock private CortexRecordService records;
    @Mock private AuthorizationService authorization;
    @Mock private HarnessRuleSetRepository ruleSets;
    @Mock private WorkspaceRepository workspaces;
    @Mock private com.taskforce.tf_api.core.repository.WorkspaceMemberRepository members;
    @Mock private com.taskforce.tf_api.core.repository.ProjectRepository projectRepository;
    @Mock private com.taskforce.tf_api.core.repository.IssueRepository issueRepository;
    @Mock private McpClient client;

    private final ObjectMapper json = new ObjectMapper();
    private final Workspace ws = Workspace.builder().id(1L).slug("acme")
        .owner(User.builder().email("owner@acme.test").build()).build();
    private McpActionService service;

    @BeforeEach
    void setUp() {
        lenient().when(workspaces.findById(1L)).thenReturn(Optional.of(ws));
        lenient().when(records.open(any(), any(), any())).thenReturn(RECORD);
        lenient().when(records.append(any(), any(), any(), any())).thenReturn(Optional.of("hash"));
        service = new McpActionService(workspaceMcp, new CortexGate(new HarnessRulesService(ruleSets, members), workspaces, projectRepository, issueRepository, json), records,
            authorization, json);
    }

    private ExternalMcpTool tool(String name, ToolClass cls, ConnectionScope scope) throws Exception {
        ExternalMcpTool t = new ExternalMcpTool(client, new McpClient.ServerRef("linear", "http://x/mcp", "AT"),
            new McpClient.ToolDef(name, "d", json.readTree("{\"type\":\"object\"}"), false), json, cls, scope);
        when(workspaceMcp.toolFor(1L, 7L, "linear__" + name)).thenReturn(Optional.of(t));
        return t;
    }

    private void serverAnswers(String output) {
        McpClient.Session session = new McpClient.Session("http://x/mcp", null, "AT");
        when(client.initialize(any())).thenReturn(session);
        when(client.callTool(eq(session), any(), any())).thenReturn(output);
    }

    @Test
    @DisplayName("une lecture permise tourne, et la demande, la décision et le résultat entrent au dossier")
    void anAllowedReadRunsAndIsRecorded() throws Exception {
        tool("list_issues", ToolClass.READ, ConnectionScope.PERSONAL);
        serverAnswers("[]");

        McpActionService.ActionResult r = service.run(ws, 7L, "linear__list_issues", Map.of(), false);

        assertThat(r.status()).isEqualTo("success");
        assertThat(r.output()).isEqualTo("[]");
        verify(records).append(eq(RECORD), eq("action.requested"), eq(CortexRecordService.Actor.person(7L)), any());
        verify(records).append(eq(RECORD), eq("action.decided"), eq(CortexRecordService.Actor.rule("read-company-tools")), any());
        verify(records).append(eq(RECORD), eq("action.result"), eq(CortexRecordService.Actor.SERVER), any());
    }

    @Test
    @DisplayName("une écriture demandée sans confirmation : rien ne part, la console demande, la tentative est au dossier")
    void anAskedWriteWaitsForConfirmation() throws Exception {
        tool("save_issue", ToolClass.WRITE, ConnectionScope.PERSONAL);

        McpActionService.ActionResult r = service.run(ws, 7L, "linear__save_issue", Map.of("title", "x"), false);

        assertThat(r.status()).isEqualTo("confirm");
        assertThat(r.reason()).isNotBlank();
        verify(client, never()).initialize(any());
        verify(records).append(eq(RECORD), eq("action.decided"), any(), any());
    }

    @Test
    @DisplayName("confirmée par la personne : l'accord entre au dossier, puis l'action tourne")
    void aConfirmedWriteRuns() throws Exception {
        tool("save_issue", ToolClass.WRITE, ConnectionScope.PERSONAL);
        serverAnswers("Created TF-9");

        McpActionService.ActionResult r = service.run(ws, 7L, "linear__save_issue", Map.of("title", "x"), true);

        assertThat(r.status()).isEqualTo("success");
        verify(records).append(eq(RECORD), eq("human.decision"), eq(CortexRecordService.Actor.person(7L)), any());
    }

    @Test
    @DisplayName("les règles refusent : rien ne part, le refus et sa raison sont rendus")
    void refusedByTheRules() throws Exception {
        tool("list_issues", ToolClass.READ, ConnectionScope.PERSONAL);
        CortexGate deny = Mockito.mock(CortexGate.class);
        when(deny.judge(any(), Mockito.<String, String>anyMap()))
            .thenReturn(new CortexGate.Verdict("deny", "frozen", "Frozen.", Map.of()));
        service = new McpActionService(workspaceMcp, deny, records, authorization, json);

        McpActionService.ActionResult r = service.run(ws, 7L, "linear__list_issues", Map.of(), true);

        assertThat(r.status()).isEqualTo("refused");
        assertThat(r.reason()).isEqualTo("Frozen.");
        verify(client, never()).initialize(any());
    }

    @Test
    @DisplayName("le geste de la personne : l'acteur est une personne, et un secret dans ses arguments ne part pas (R157)")
    void theConsoleIsThePersonsGestureAndKeepsSecrets() throws Exception {
        tool("save_issue", ToolClass.WRITE, ConnectionScope.PERSONAL);
        String secret = "gh" + "p_" + "a".repeat(36); // écrit en morceaux : un faux jeton, que l'analyse reconnaît

        McpActionService.ActionResult r = service.run(ws, 7L, "linear__save_issue", Map.of("title", secret), true);

        assertThat(r.status()).isEqualTo("refused");
        verify(client, never()).initialize(any());
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> decided = ArgumentCaptor.forClass(Map.class);
        verify(records).append(eq(RECORD), eq("action.decided"), eq(CortexRecordService.Actor.rule("floor-no-secret")),
            decided.capture());
        assertThat(decided.getValue().get("facts")).asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.MAP)
            .containsEntry("actor", "person").containsEntry("secret", "true");
    }

    @Test
    @DisplayName("une écriture par une connexion partagée : réservée aux propriétaires et administrateurs")
    void aSharedWriteNeedsAManager() throws Exception {
        tool("save_issue", ToolClass.WRITE, ConnectionScope.WORKSPACE);
        when(authorization.isManager(1L, 7L)).thenReturn(false);

        assertThatThrownBy(() -> service.run(ws, 7L, "linear__save_issue", Map.of(), true))
            .isInstanceOf(ForbiddenException.class);
        verify(records, never()).open(any(), any(), any());
    }

    @Test
    @DisplayName("un outil que la personne n'utilise pas (une autre personne, changé, inconnu) : introuvable")
    void anUnavailableToolIsNotFound() {
        when(workspaceMcp.toolFor(1L, 7L, "linear__ghost")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.run(ws, 7L, "linear__ghost", Map.of(), true))
            .isInstanceOf(ResourceNotFoundException.class);
    }
}
