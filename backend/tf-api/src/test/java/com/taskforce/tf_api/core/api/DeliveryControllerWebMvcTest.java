package com.taskforce.tf_api.core.api;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.dto.response.DeliveryOpenApprovalResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryProviderResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunActivityResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.dto.response.MissionChangesResponse;
import com.taskforce.tf_api.core.dto.response.MissionFileChangeResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.delivery.DeliveryActivityService;
import com.taskforce.tf_api.core.service.delivery.DeliveryRunner;
import com.taskforce.tf_api.core.service.delivery.DeliveryService;
import com.taskforce.tf_api.core.service.delivery.MissionChangesService;
import com.taskforce.tf_api.core.service.delivery.MissionResultService;
import com.taskforce.tf_api.core.service.delivery.ProjectDeliveryService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tranche web {@link DeliveryController} (TF-AGENT-DELIVERY slice 2) : liste des providers délégables.
 * Registre mocké ; contrat HTTP (200 + forme JSON).
 */
@WebMvcTest(DeliveryController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("DeliveryController (@WebMvcTest)")
class DeliveryControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private DeliveryService deliveryService;
    @MockitoBean private DeliveryRunner deliveryRunner;
    @MockitoBean private DeliveryActivityService activityService;
    @MockitoBean private MissionResultService missionResults;
    @MockitoBean private MissionChangesService missionChanges;
    @MockitoBean private ProjectDeliveryService projectDelivery;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;             // WorkspaceAccessInterceptor
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository; // WorkspaceAccessInterceptor

    private static final String EMAIL = "dev@it.dev";

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET /delivery/providers?projectId= → 200 + agents prêts ou non pour la personne")
    void listProviders_200() throws Exception {
        var a = auth();
        when(deliveryService.listProviders("acme", 12L, 7L)).thenReturn(List.of(
            new DeliveryProviderResponse("claude-code", "Claude Code", "anthropic", true, List.of("claude-opus-5"), false,
                "Set up your local runner first (Settings > Agents), then start it on your machine.", false)));

        mockMvc.perform(get("/api/workspaces/acme/delivery/providers").param("projectId", "12").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].key").value("claude-code"))
            .andExpect(jsonPath("$.data[0].available").value(true))
            .andExpect(jsonPath("$.data[0].ready").value(false))
            .andExpect(jsonPath("$.data[0].reason").value(org.hamcrest.Matchers.containsString("local runner")));
    }

    @Test
    @DisplayName("POST /delivery/issues/{id}/delegate → 200 + run (QUEUED)")
    void delegate_200() throws Exception {
        var a = auth();
        var run = new DeliveryRunResponse(1L, 5L, "WEB-5", "Fix the footer", 12L, "Website", "claude-code", "claude-sonnet-5", "QUEUED",
            null, null, null, false, 7L, null, null);
        when(deliveryService.delegate(anyString(), anyLong(), anyString(), org.mockito.ArgumentMatchers.any(), anyLong()))
            .thenReturn(run);

        mockMvc.perform(post("/api/workspaces/acme/delivery/issues/5/delegate").with(a)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"providerKey\":\"claude-code\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.providerKey").value("claude-code"))
            .andExpect(jsonPath("$.data.status").value("QUEUED"))
            // De quoi afficher et ouvrir le run hors de sa fiche d'issue (historique, canvas).
            .andExpect(jsonPath("$.data.issueKey").value("WEB-5"))
            .andExpect(jsonPath("$.data.issueTitle").value("Fix the footer"))
            .andExpect(jsonPath("$.data.projectId").value(12));
    }

    @Test
    @DisplayName("GET /delivery/issues/{id}/run → 200 (data null si aucun run)")
    void latestRun_200_empty() throws Exception {
        var a = auth();
        when(deliveryService.latestRun(anyString(), anyLong(), anyLong())).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/workspaces/acme/delivery/issues/5/run").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    private static DeliveryRunResponse run(long id, String status) {
        return new DeliveryRunResponse(id, 5L, "WEB-5", "Fix the footer", 12L, "Website", "claude-code", "Claude Code",
            status, null, null, null, false, 7L, null, null);
    }

    @ParameterizedTest(name = "dernier run {0} : relu = {1}")
    @CsvSource({ "RUNNING, true", "QUEUED, true", "DONE, false", "FAILED, false" })
    @DisplayName("GET /delivery/issues/{id}/run : relit un run en cours OU en attente (délégation non réclamée close)")
    void latestRun_refreshes_in_flight_runs(String status, boolean refreshed) throws Exception {
        var a = auth();
        when(deliveryService.latestRun(anyString(), anyLong(), anyLong())).thenReturn(Optional.of(run(9L, status)));

        mockMvc.perform(get("/api/workspaces/acme/delivery/issues/5/run").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value(status));

        verify(deliveryRunner, times(refreshed ? 1 : 0)).refresh(9L);
    }

    private static com.taskforce.tf_api.core.dto.response.ProjectRunResponse projectRun(long id, String status) {
        return new com.taskforce.tf_api.core.dto.response.ProjectRunResponse(run(id, status), null,
            new com.taskforce.tf_api.core.dto.response.ProjectRunResponse.Links(null, null, null, null), List.of());
    }

    private static com.taskforce.tf_api.shared.dto.PageResponse<com.taskforce.tf_api.core.dto.response.ProjectRunResponse> page(
            com.taskforce.tf_api.core.dto.response.ProjectRunResponse... rows) {
        return com.taskforce.tf_api.shared.dto.PageResponse.<com.taskforce.tf_api.core.dto.response.ProjectRunResponse>builder()
            .content(List.of(rows)).pageNumber(0).pageSize(20).totalElements(rows.length).totalPages(1).first(true).last(true)
            .empty(rows.length == 0).build();
    }

    @Test
    @DisplayName("GET /delivery/projects/{id}/runs : une page du projet ; les missions en attente ou en cours avancent, puis la page se relit")
    void projectRuns_advance_missions_in_flight_then_read_again() throws Exception {
        var a = auth();
        when(projectDelivery.listRuns("acme", 12L, 1, 30, 7L))
            .thenReturn(page(projectRun(1L, "QUEUED"), projectRun(2L, "RUNNING"), projectRun(3L, "DONE")))
            .thenReturn(page(projectRun(1L, "FAILED"), projectRun(2L, "RUNNING"), projectRun(3L, "DONE")));

        mockMvc.perform(get("/api/workspaces/acme/delivery/projects/12/runs").param("page", "1").param("size", "30").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.content[0].run.status").value("FAILED"))
            .andExpect(jsonPath("$.data.content[0].links").exists())
            .andExpect(jsonPath("$.data.totalElements").value(3));

        verify(deliveryRunner).refresh(1L);
        verify(deliveryRunner).refresh(2L);
        verify(deliveryRunner, never()).refresh(3L);
        verify(projectDelivery, times(2)).listRuns("acme", 12L, 1, 30, 7L);
    }

    @Test
    @DisplayName("GET /delivery/projects/{id}/runs : par défaut la première page de 20 ; sans mission en vol, une seule lecture")
    void projectRuns_default_page_reads_once_without_missions_in_flight() throws Exception {
        var a = auth();
        when(projectDelivery.listRuns("acme", 12L, 0, 20, 7L)).thenReturn(page(projectRun(3L, "DONE")));

        mockMvc.perform(get("/api/workspaces/acme/delivery/projects/12/runs").with(a)).andExpect(status().isOk());

        verify(deliveryRunner, never()).refresh(anyLong());
        verify(projectDelivery, times(1)).listRuns("acme", 12L, 0, 20, 7L);
    }

    @Test
    @DisplayName("GET /delivery/projects/{id}/runs : au plus 10 missions avancent par lecture")
    void projectRuns_advance_ten_missions_at_most() throws Exception {
        var a = auth();
        var rows = java.util.stream.LongStream.rangeClosed(1, 12).mapToObj(id -> projectRun(id, "RUNNING"))
            .toArray(com.taskforce.tf_api.core.dto.response.ProjectRunResponse[]::new);
        when(projectDelivery.listRuns(anyString(), anyLong(), org.mockito.ArgumentMatchers.anyInt(),
            org.mockito.ArgumentMatchers.anyInt(), anyLong())).thenReturn(page(rows));

        mockMvc.perform(get("/api/workspaces/acme/delivery/projects/12/runs").with(a)).andExpect(status().isOk());

        verify(deliveryRunner, times(DeliveryController.MAX_ADVANCED_RUNS)).refresh(anyLong());
    }

    @ParameterizedTest(name = "mission {0} : avance et se relit = {1}")
    @CsvSource({ "RUNNING, true", "QUEUED, true", "DONE, false" })
    @DisplayName("GET /delivery/projects/{id}/runs/{runId} : une mission du projet, relue après avoir avancé si elle est en vol")
    void projectRun_reads_one_mission(String status, boolean advanced) throws Exception {
        var a = auth();
        when(projectDelivery.run("acme", 12L, 9L, 7L)).thenReturn(projectRun(9L, status));

        mockMvc.perform(get("/api/workspaces/acme/delivery/projects/12/runs/9").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.run.id").value(9))
            .andExpect(jsonPath("$.data.approvals").isArray());

        verify(deliveryRunner, times(advanced ? 1 : 0)).refresh(9L);
        verify(projectDelivery, times(advanced ? 2 : 1)).run("acme", 12L, 9L, 7L);
    }

    @Test
    @DisplayName("GET /delivery/runs : relit les runs en attente, puis recharge la liste")
    void listRuns_refreshes_queued_runs() throws Exception {
        var a = auth();
        when(deliveryService.listRuns(anyString(), anyLong()))
            .thenReturn(List.of(run(1L, "QUEUED"), run(2L, "DONE")))
            .thenReturn(List.of(run(1L, "FAILED"), run(2L, "DONE")));

        mockMvc.perform(get("/api/workspaces/acme/delivery/runs").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].status").value("FAILED"));

        verify(deliveryRunner).refresh(1L);
        verify(deliveryRunner, never()).refresh(2L);
        verify(deliveryService, times(2)).listRuns(anyString(), anyLong());
    }

    @Test
    @DisplayName("GET /delivery/runs sans run en attente : une seule lecture, aucune relecture")
    void listRuns_without_queued_reads_once() throws Exception {
        var a = auth();
        when(deliveryService.listRuns(anyString(), anyLong())).thenReturn(List.of(run(2L, "DONE")));

        mockMvc.perform(get("/api/workspaces/acme/delivery/runs").with(a))
            .andExpect(status().isOk());

        verify(deliveryRunner, never()).refresh(anyLong());
        verify(deliveryService, times(1)).listRuns(anyString(), anyLong());
    }

    @Test
    @DisplayName("GET /delivery/approvals/open : ce qui attend la personne, une ligne par mission (R128)")
    void openApprovals_200() throws Exception {
        var a = auth();
        when(activityService.openApprovals("acme", 7L)).thenReturn(List.of(
            new DeliveryOpenApprovalResponse(100L, 55L, "OPS-12", "Fix the footer", 12L, 3)));

        mockMvc.perform(get("/api/workspaces/acme/delivery/approvals/open").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].runId").value(100))
            .andExpect(jsonPath("$.data[0].issueId").value(55))
            .andExpect(jsonPath("$.data[0].issueKey").value("OPS-12"))
            .andExpect(jsonPath("$.data[0].issueTitle").value("Fix the footer"))
            .andExpect(jsonPath("$.data[0].projectId").value(12))
            .andExpect(jsonPath("$.data[0].requests").value(3));
    }

    @Test
    @DisplayName("GET /runs/{id}/activity : chronologie après N et demandes du run")
    void activity_200() throws Exception {
        var a = auth();
        when(activityService.activity("acme", 100L, 3, 7L)).thenReturn(new DeliveryRunActivityResponse(
            List.of(new DeliveryRunActivityResponse.Event(4, "tool", "Bash", "npm test", null)),
            List.of(new DeliveryRunActivityResponse.Approval(9L, "WebSearch", "electron-updater progress", "PENDING", null, null,
                null, null, true, "agent", "web.search", "search-web", "A web search sends its query out of the machine.", null))));

        mockMvc.perform(get("/api/workspaces/acme/delivery/runs/100/activity").param("after", "3").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.events[0].seq").value(4))
            .andExpect(jsonPath("$.data.approvals[0].canDecide").value(true))
            .andExpect(jsonPath("$.data.approvals[0].action").value("web.search"))
            .andExpect(jsonPath("$.data.approvals[0].reason").value("A web search sends its query out of the machine."));
    }

    @ParameterizedTest(name = "GET /runs/100/evidence?format={0} : {1}, sans enveloppe")
    @CsvSource({
        "json, application/json, evidence-run-100.json, false",
        "md, text/markdown, evidence-run-100.md, true",
    })
    void evidence_200(String format, String type, String file, boolean markdown) throws Exception {
        var a = auth();
        when(activityService.dossier("acme", 100L, 7L, markdown)).thenReturn(Optional.of("FILE"));

        mockMvc.perform(get("/api/workspaces/acme/delivery/runs/100/evidence").param("format", format).with(a))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(type))
            .andExpect(header()
                .string("Content-Disposition", "attachment; filename=\"" + file + "\""))
            .andExpect(content().string("FILE"));
    }

    @Test
    @DisplayName("GET /runs/{id}/evidence : 404 pour un run sans dossier")
    void evidence_404_without_file() throws Exception {
        var a = auth();
        when(activityService.dossier("acme", 100L, 7L, false)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/workspaces/acme/delivery/runs/100/evidence").with(a))
            .andExpect(status().isNotFound());
    }

    @ParameterizedTest(name = "POST approval : {0} {1} -> autorisé={2}, pour la mission={3}, enregistré {4}")
    @CsvSource(delimiter = '|', value = {
        "ALLOW |         | true  | false | ONCE    | Allowed once",
        "ALLOW | ONCE    | true  | false | ONCE    | Allowed once",
        "ALLOW | MISSION | true  | true  | MISSION | Allowed for this mission", // R46 : le reste de la mission
        "ALLOW | MISSION | true  | true  | ONCE    | Allowed once",             // une décision qui lie vaut une fois
        "ALLOW |         | true  | false |         | Approval recorded: the request waits for the other approvers",
        "DENY  |         | false | false | ONCE    | Action denied",
        "DENY  | MISSION | false | false | ONCE    | Action denied",            // un refus vaut une fois
    })
    void decide_200(String decision, String scope, boolean allow, boolean forMission, String stored, String message)
            throws Exception {
        var a = auth();
        String body = scope == null ? "{\"decision\":\"" + decision + "\"}"
            : "{\"decision\":\"" + decision + "\",\"scope\":\"" + scope + "\"}";
        // La réponse dit ce que le service a enregistré, pas seulement ce que la personne a demandé.
        when(activityService.decide("acme", 100L, 9L, allow, forMission, 7L)).thenReturn(stored);

        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/approvals/9").with(a)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message").value(message));

        verify(activityService).decide("acme", 100L, 9L, allow, forMission, 7L);
    }

    @ParameterizedTest(name = "POST approval : {0} refusé (400)")
    @CsvSource(delimiter = '|', value = {
        "{\"decision\":\"MAYBE\"}",
        "{\"decision\":\"ALLOW\",\"scope\":\"FOREVER\"}",
    })
    void decide_rejects_unknown_decision(String body) throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/approvals/9")
                .with(jwt().jwt(b -> b.claim("email", EMAIL)))
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());

        verify(activityService, never()).decide(any(), any(), any(), anyBoolean(), anyBoolean(), any());
    }

    // --------------------------------------------------------------------- carte de résultat (R78)

    @Test
    @DisplayName("POST /runs/{id}/apply : la personne applique le résultat")
    void apply_200() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/apply").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message").value("Applied: the pull request is merged"));

        verify(missionResults).apply("acme", 100L, 7L, null);
    }

    @Test
    @DisplayName("POST /runs/{id}/apply : la raison de passer outre des tests en échec va au service (R87)")
    void apply_with_a_reason_200() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/apply").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"The date test is flaky\"}"))
            .andExpect(status().isOk());

        verify(missionResults).apply("acme", 100L, 7L, "The date test is flaky");
    }

    @Test
    @DisplayName("POST /runs/{id}/apply : une raison trop longue est refusée (400)")
    void apply_rejects_a_long_reason() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/apply").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + "x".repeat(2001) + "\"}"))
            .andExpect(status().isBadRequest());

        verify(missionResults, never()).apply(any(), any(), any(), any());
    }

    @Test
    @DisplayName("POST /runs/{id}/discard : la personne écarte le résultat")
    void discard_200() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/discard").with(auth()))
            .andExpect(status().isOk());

        verify(missionResults).discard("acme", 100L, 7L);
    }

    @Test
    @DisplayName("POST /runs/{id}/done : la personne termine l'issue d'une mission qui n'a rien changé")
    void mark_done_200() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/done").with(auth()))
            .andExpect(status().isOk());

        verify(missionResults).markDone("acme", 100L, 7L);
    }

    @Test
    @DisplayName("POST /runs/{id}/stop : la personne arrête la mission (R138)")
    void stop_200() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/stop").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message").value("Stopped"));

        verify(missionResults).stop("acme", 100L, 7L);
    }

    @Test
    @DisplayName("POST /runs/{id}/retry : une nouvelle mission part avec la remarque")
    void retry_200() throws Exception {
        var a = auth();
        when(missionResults.retry("acme", 100L, 7L, "Keep the Privacy link")).thenReturn(run(101L, "QUEUED"));

        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/retry").with(a)
                .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"Keep the Privacy link\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.id").value(101));
        verify(deliveryRunner).execute(101L);
    }

    @Test
    @DisplayName("POST /runs/{id}/retry : une remarque trop longue est refusée (400)")
    void retry_rejects_a_long_note() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/retry").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"" + "x".repeat(2001) + "\"}"))
            .andExpect(status().isBadRequest());

        verify(missionResults, never()).retry(any(), any(), any(), any());
    }

    @Test
    @DisplayName("GET /runs/{id}/changes : les fichiers de la mission et ce que la personne peut en faire")
    void changes_200() throws Exception {
        var a = auth();
        when(missionChanges.changes("acme", 100L, 7L)).thenReturn(new MissionChangesResponse("repo", true, 12, 1, 0, List.of(
            new MissionChangesResponse.File("a.txt", "modified", 12, 1, false, false, false, "r1", false, null, null)),
            false, false, true, null, null));

        mockMvc.perform(get("/api/workspaces/acme/delivery/runs/100/changes").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.live").value(true))
            .andExpect(jsonPath("$.data.added").value(12))
            .andExpect(jsonPath("$.data.files[0].path").value("a.txt"))
            .andExpect(jsonPath("$.data.files[0].removed").value(1));
    }

    @Test
    @DisplayName("GET /runs/{id}/changes/file?path= : le diff d'un fichier")
    void changedFile_200() throws Exception {
        var a = auth();
        when(missionChanges.file("acme", 100L, "src/a b.txt", 7L)).thenReturn(
            new MissionFileChangeResponse("src/a b.txt", "diff", "@@ -1 +1 @@", false, false, false, "r1"));

        mockMvc.perform(get("/api/workspaces/acme/delivery/runs/100/changes/file").param("path", "src/a b.txt").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.format").value("diff"))
            .andExpect(jsonPath("$.data.body").value("@@ -1 +1 @@"));
    }

    @Test
    @DisplayName("POST /runs/{id}/changes/revert : un fichier à remettre comme avant")
    void revert_200() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/changes/revert").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"path\":\"a.txt\"}"))
            .andExpect(status().isOk());

        verify(missionChanges).revert("acme", 100L, "a.txt", 7L);
    }

    @Test
    @DisplayName("POST /runs/{id}/changes/revert : sans fichier, refusé (400)")
    void revert_needs_a_path() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/changes/revert").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"path\":\"  \"}"))
            .andExpect(status().isBadRequest());

        verify(missionChanges, never()).revert(any(), any(), any(), any());
    }

    @Test
    @DisplayName("POST /runs/{id}/follow-up : les commentaires relancent l'agent, et la réponse est la nouvelle mission")
    void followUp_200() throws Exception {
        var a = auth();
        when(missionResults.askForChanges(anyString(), anyLong(), anyLong(), any())).thenReturn(run(101L, "QUEUED"));

        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/follow-up").with(a)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"comments\":[{\"path\":\"a.txt\",\"line\":12,\"side\":\"new\",\"text\":\"Use the helper\"}]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.id").value(101));

        verify(deliveryRunner).execute(101L);
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
        "aucun commentaire | {\"comments\":[]}",
        "ligne zéro | {\"comments\":[{\"path\":\"a\",\"line\":0,\"side\":\"new\",\"text\":\"x\"}]}",
        "côté inconnu | {\"comments\":[{\"path\":\"a\",\"line\":1,\"side\":\"left\",\"text\":\"x\"}]}",
        "sans texte | {\"comments\":[{\"path\":\"a\",\"line\":1,\"side\":\"new\",\"text\":\" \"}]}",
    })
    @DisplayName("POST /runs/{id}/follow-up : des commentaires mal formés sont refusés (400)")
    void followUp_validates(String label, String body) throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/follow-up").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());

        verify(missionResults, never()).askForChanges(any(), any(), any(), any());
    }

    @Test
    @DisplayName("POST /runs/{id}/correction : une correction pour l'agent")
    void correction_200() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/correction").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"Use tabs\"}"))
            .andExpect(status().isOk());

        verify(missionChanges).correct("acme", 100L, "Use tabs", 7L);
    }

    @Test
    @DisplayName("POST /runs/{id}/correction : une correction trop longue est refusée (400)")
    void correction_too_long() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/correction").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"" + "x".repeat(2001) + "\"}"))
            .andExpect(status().isBadRequest());
    }
}
