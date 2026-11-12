package com.taskforce.tf_api.modules.storage.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.CortexGate;
import com.taskforce.tf_api.core.service.agent.CortexRecordService;
import com.taskforce.tf_api.modules.ged.service.ObjectStorage;
import com.taskforce.tf_api.modules.storage.domain.StorageKind;
import com.taskforce.tf_api.modules.storage.domain.StorageTarget;
import com.taskforce.tf_api.modules.storage.domain.StoredDocument;
import com.taskforce.tf_api.modules.storage.repository.StoredDocumentRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@DisplayName("Cortex range un document, après l'accord d'une personne (R156, R157)")
class SaveDocumentToolTest {

    private static final long WS = 1L;
    private static final long ADA = 7L;

    private final StorageTargetService targets = Mockito.mock(StorageTargetService.class);
    private final StoredDocumentRepository documents = Mockito.mock(StoredDocumentRepository.class);
    private final CortexRecordService records = Mockito.mock(CortexRecordService.class);
    private final ProjectRepository projects = Mockito.mock(ProjectRepository.class);
    private final ProjectVisibilityGuard visibility = Mockito.mock(ProjectVisibilityGuard.class);
    private final ObjectStorage objects = Mockito.mock(ObjectStorage.class);
    private final List<String> events = new ArrayList<>();
    private final UUID record = UUID.randomUUID();
    private final AgentContext ctx = new AgentContext("acme", WS, ADA, null, "save it", 30L, null);

    private SaveDocumentTool tool;
    private StorageTarget current = StorageTarget.server(WS);

    @BeforeEach
    void setUp() {
        when(targets.effective(eq(WS), any())).thenAnswer(i -> new StorageTargetService.Resolved(current, "workspace"));
        when(targets.writer(StorageKind.SERVER)).thenReturn(new ServerDocumentWriter(objects));
        when(projects.findByIdAndWorkspaceId(30L, WS)).thenReturn(Optional.of(Project.builder().id(30L).build()));
        when(visibility.canView(any(), anyLong())).thenReturn(true);
        when(records.open(any(), anyString(), any())).thenReturn(record);
        when(records.append(eq(record), anyString(), any(), any())).thenAnswer(i -> {
            events.add(i.getArgument(1));
            return Optional.of("hash");
        });
        when(documents.save(any())).thenAnswer(i -> i.getArgument(0));
        DocumentStorageService storage = new DocumentStorageService(targets, documents, records, projects, visibility);
        tool = new SaveDocumentTool(storage, targets);
    }

    @Test
    @DisplayName("la carte dit ce qui sera écrit et où, et garde l'endroit montré")
    void card() {
        current = StorageTarget.builder().workspaceId(WS).kind(StorageKind.GOOGLE_DRIVE).folderId("f1")
            .folderName("Reports").build();
        Map<String, Object> card = tool.ask(Map.of("title", "Weekly report", "content", "# Week"), ctx);
        assertThat(card).containsEntry("storage", "google-drive").containsEntry("folder", "Reports")
            .containsEntry("place", "google-drive:f1").containsEntry("projectId", 30L);
        assertThat(tool.preview(card, ctx).text()).isEqualTo("It will be saved to Google Drive, in Reports.");
    }

    @Test
    @DisplayName("pour Cortex, ranger est une sortie : les règles demandent une personne")
    void judgedAsAnExitThatAsks() {
        WorkspaceRepository workspaces = Mockito.mock(WorkspaceRepository.class);
        when(workspaces.findById(WS)).thenReturn(Optional.of(Workspace.builder().id(WS).slug("acme").build()));
        CortexGate gate = new CortexGate(new HarnessRulesService(Mockito.mock(HarnessRuleSetRepository.class),
            Mockito.mock(WorkspaceMemberRepository.class)), workspaces, projects, Mockito.mock(IssueRepository.class),
            new ObjectMapper());
        CortexGate.Verdict verdict = gate.judge(gate.rulesFor(ctx), tool, "{\"title\":\"r\",\"content\":\"c\"}",
            CortexGate.Exposure.none());
        assertThat(verdict.allowed()).isFalse();
        assertThat(verdict.denied()).isFalse();
        assertThat(verdict.facts()).containsEntry("action", "mcp.write").containsEntry("tool", "save_document");
    }

    @Test
    @DisplayName("accordé, le document est rangé, le dossier le dit avant et après, et le registre dit où il vit")
    void savedWithItsTrace() {
        Map<String, Object> card = tool.ask(Map.of("title", "Weekly report", "content", "# Week 46"), ctx);
        String out = tool.perform(card, ctx).text();

        assertThat(out).isEqualTo("Saved \"Weekly report\" in TaskForce.");
        assertThat(events).containsExactly("storage.requested", "storage.written");
        verify(objects).upload(Mockito.startsWith("documents/1/"), any(), eq(9L), eq("text/markdown"));
        verify(documents).save(Mockito.argThat((StoredDocument d) -> d.getKind() == StorageKind.SERVER
            && d.getRecordId().equals(record) && d.getApprovedBy() == ADA && d.getProjectId() == 30L
            && d.getFileName().equals("Weekly report.md") && d.getSizeBytes() == 9L));
    }

    @Test
    @DisplayName("un endroit qui a changé entre la carte et l'accord : rien ne s'écrit")
    void placeChanged() {
        Map<String, Object> card = tool.ask(Map.of("title", "Weekly report", "content", "# Week"), ctx);
        current = StorageTarget.builder().workspaceId(WS).kind(StorageKind.ONEDRIVE).driveId("d").folderId("i").build();
        assertThatThrownBy(() -> tool.perform(card, ctx)).isInstanceOf(BusinessException.class)
            .hasMessage(DocumentStorageService.PLACE_CHANGED);
        verify(records, never()).open(any(), anyString(), any());
        verify(objects, never()).upload(anyString(), any(), anyLong(), anyString());
    }

    @Test
    @DisplayName("un document vide ou sans titre ne se range pas")
    void emptyRefused() {
        assertThatThrownBy(() -> tool.perform(Map.of("title", "r", "content", " "), ctx))
            .isInstanceOf(BusinessException.class).hasMessageContaining("empty");
        assertThatThrownBy(() -> tool.perform(Map.of("title", " ", "content", "x"), ctx))
            .isInstanceOf(BusinessException.class).hasMessageContaining("title");
        assertThatThrownBy(() -> tool.perform(Map.of("title", "r", "content", "x".repeat(1_000_001)), ctx))
            .isInstanceOf(BusinessException.class).hasMessageContaining("1 MB");
    }

    @Test
    @DisplayName("les mots de l'endroit, pour chaque cible")
    void where() {
        assertThat(SaveDocumentTool.where(StorageKind.SERVER, null)).isEqualTo("in TaskForce");
        assertThat(SaveDocumentTool.where(StorageKind.MACHINE, "C:\\Reports")).isEqualTo("on this computer, in C:\\Reports");
        assertThat(SaveDocumentTool.where(StorageKind.ONEDRIVE, "Team")).isEqualTo("to OneDrive or SharePoint, in Team");
        assertThat(SaveDocumentTool.where(StorageKind.GOOGLE_DRIVE, null)).isEqualTo("to Google Drive");
    }
}
