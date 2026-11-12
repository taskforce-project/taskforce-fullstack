package com.taskforce.tf_api.modules.storage.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectMember;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.modules.ged.service.ObjectStorage;
import com.taskforce.tf_api.modules.storage.domain.StorageKind;
import com.taskforce.tf_api.modules.storage.domain.StorageTarget;
import com.taskforce.tf_api.modules.storage.domain.StoredDocument;
import com.taskforce.tf_api.modules.storage.repository.StorageTargetRepository;
import com.taskforce.tf_api.modules.storage.repository.StoredDocumentRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@DisplayName("Où TaskForce range ce qu'il écrit : l'espace, le projet (R156)")
class StorageTargetServiceTest {

    private static final long WS = 1L;
    private static final long ADA = 7L;   // administratrice
    private static final long BOB = 8L;   // membre, responsable du projet 30
    private static final long CAL = 9L;   // membre

    private final StorageTargetRepository targets = Mockito.mock(StorageTargetRepository.class);
    private final StoredDocumentRepository documents = Mockito.mock(StoredDocumentRepository.class);
    private final WorkspaceRepository workspaces = Mockito.mock(WorkspaceRepository.class);
    private final ProjectRepository projects = Mockito.mock(ProjectRepository.class);
    private final ProjectMemberRepository members = Mockito.mock(ProjectMemberRepository.class);
    private final ProjectVisibilityGuard visibility = Mockito.mock(ProjectVisibilityGuard.class);
    private final AuthorizationService authorization = Mockito.mock(AuthorizationService.class);
    private final UserRepository users = Mockito.mock(UserRepository.class);
    private final Project project = Project.builder().id(30L).build();

    private StorageTargetService service;

    @BeforeEach
    void setUp() {
        Workspace ws = Workspace.builder().id(WS).slug("acme").build();
        when(workspaces.findBySlug("acme")).thenReturn(Optional.of(ws));
        when(authorization.isManager(WS, ADA)).thenReturn(true);
        when(projects.findByIdAndWorkspaceId(30L, WS)).thenReturn(Optional.of(project));
        when(visibility.canView(any(), any())).thenReturn(true);
        when(visibility.viewableProjectIds(any(), any())).thenReturn(List.of(30L));
        when(members.findByProjectIdAndUserId(30L, BOB))
            .thenReturn(Optional.of(ProjectMember.builder().role(ProjectRole.LEAD).build()));
        when(members.findByProjectIdAndUserId(30L, CAL))
            .thenReturn(Optional.of(ProjectMember.builder().role(ProjectRole.MEMBER).build()));
        lenient().when(users.findById(ADA)).thenReturn(Optional.of(User.builder().id(ADA).email("ada@acme.test")
            .displayName("Ada").build()));
        when(targets.save(any())).thenAnswer(i -> i.getArgument(0));
        service = new StorageTargetService(targets, documents, workspaces, projects, members, visibility, authorization,
            users, List.of(new ServerDocumentWriter(Mockito.mock(ObjectStorage.class)), new MachineDocumentWriter(false)));
    }

    @Test
    @DisplayName("sans choix, c'est le serveur de TaskForce ; un projet prend le choix de l'espace, puis le sien")
    void effective() {
        assertThat(service.effective(WS, null).target().getKind()).isEqualTo(StorageKind.SERVER);
        assertThat(service.effective(WS, null).from()).isEqualTo("default");

        StorageTarget drive = StorageTarget.builder().workspaceId(WS).kind(StorageKind.GOOGLE_DRIVE).folderId("f1")
            .folderName("Reports").build();
        when(targets.findByWorkspaceIdAndProjectIdIsNull(WS)).thenReturn(Optional.of(drive));
        assertThat(service.effective(WS, 30L).from()).isEqualTo("workspace");
        assertThat(service.effective(WS, 30L).target().place()).isEqualTo("google-drive:f1");

        StorageTarget own = StorageTarget.builder().workspaceId(WS).projectId(30L).kind(StorageKind.SERVER).build();
        when(targets.findByWorkspaceIdAndProjectId(WS, 30L)).thenReturn(Optional.of(own));
        assertThat(service.effective(WS, 30L).from()).isEqualTo("project");
        assertThat(service.effective(WS, 30L).target().place()).isEqualTo("server");
    }

    @Test
    @DisplayName("l'espace : seuls ses propriétaires et administrateurs choisissent")
    void workspaceChoice() {
        assertThatThrownBy(() -> service.choose("acme", CAL, null, new StorageTargetService.TargetRequest("server",
            null, null, null))).isInstanceOf(ForbiddenException.class);

        StorageTargetService.Overview overview = service.choose("acme", ADA, null,
            new StorageTargetService.TargetRequest("server", null, null, null));
        ArgumentCaptor<StorageTarget> saved = ArgumentCaptor.forClass(StorageTarget.class);
        verify(targets).save(saved.capture());
        assertThat(saved.getValue().getKind()).isEqualTo(StorageKind.SERVER);
        assertThat(saved.getValue().getChosenBy()).isEqualTo(ADA);
        assertThat(overview.scope()).isEqualTo("workspace");
        assertThat(overview.canEdit()).isTrue();
        // La machine ne se propose que sur l'app desktop.
        assertThat(overview.choices()).extracting(StorageTargetService.Choice::storage).containsExactly("server");
    }

    @Test
    @DisplayName("un projet : son responsable choisit aussi ; un autre membre lit seulement")
    void projectChoice() {
        StorageTargetService.Overview byLead = service.choose("acme", BOB, 30L,
            new StorageTargetService.TargetRequest("server", null, null, null));
        assertThat(byLead.scope()).isEqualTo("project");
        assertThatThrownBy(() -> service.choose("acme", CAL, 30L,
            new StorageTargetService.TargetRequest("server", null, null, null))).isInstanceOf(ForbiddenException.class);
        assertThat(service.overview("acme", CAL, 30L).canEdit()).isFalse();
    }

    @Test
    @DisplayName("une cible inconnue, ou que l'instance n'offre pas, est refusée")
    void unknownOrUnoffered() {
        assertThatThrownBy(() -> service.choose("acme", ADA, null,
            new StorageTargetService.TargetRequest("box", null, null, null))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.choose("acme", ADA, null,
            new StorageTargetService.TargetRequest("machine", null, null, "C:/x"))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.choose("acme", ADA, null,
            new StorageTargetService.TargetRequest("google-drive", "f", null, null))).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("revenir au choix du dessus supprime la ligne")
    void reset() {
        StorageTarget own = StorageTarget.builder().workspaceId(WS).projectId(30L).kind(StorageKind.SERVER).build();
        when(targets.findByWorkspaceIdAndProjectId(WS, 30L)).thenReturn(Optional.of(own));
        service.reset("acme", BOB, 30L);
        verify(targets).delete(own);
    }

    @Test
    @DisplayName("la liste dit où vit chaque document, sans ceux d'un projet que la personne ne voit pas")
    void documents() {
        StoredDocument seen = StoredDocument.builder().id(1L).workspaceId(WS).projectId(30L).title("Report")
            .fileName("Report.md").kind(StorageKind.GOOGLE_DRIVE).folderName("Reports").webUrl("https://drive/x")
            .version("3").sizeBytes(42L).requestedBy(ADA).approvedBy(ADA).via("cortex").build();
        seen.setCreatedAt(LocalDateTime.of(2026, 11, 12, 10, 0));
        StoredDocument hidden = StoredDocument.builder().id(2L).workspaceId(WS).projectId(31L).title("Secret")
            .fileName("Secret.md").kind(StorageKind.SERVER).sizeBytes(1L).via("cortex").build();
        when(documents.findTop100ByWorkspaceIdOrderByCreatedAtDesc(WS)).thenReturn(List.of(seen, hidden));

        List<StorageTargetService.DocumentView> list = service.overview("acme", ADA, null).documents();
        assertThat(list).hasSize(1);
        StorageTargetService.DocumentView view = list.get(0);
        assertThat(view.storage()).isEqualTo("google-drive");
        assertThat(view.webUrl()).isEqualTo("https://drive/x");
        assertThat(view.version()).isEqualTo("3");
        assertThat(view.savedFor()).isEqualTo("Ada");
        assertThat(view.approvedBy()).isEqualTo("Ada");
    }

    @Test
    @DisplayName("un document d'un autre espace, ou d'un projet invisible, n'existe pas pour la personne")
    void documentAccess() {
        when(documents.findByIdAndWorkspaceId(5L, WS)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.document("acme", ADA, 5L)).isInstanceOf(ResourceNotFoundException.class);
        StoredDocument other = StoredDocument.builder().id(6L).workspaceId(WS).projectId(30L).kind(StorageKind.SERVER)
            .build();
        when(documents.findByIdAndWorkspaceId(6L, WS)).thenReturn(Optional.of(other));
        when(visibility.canView(project, CAL)).thenReturn(false);
        assertThatThrownBy(() -> service.document("acme", CAL, 6L)).isInstanceOf(ResourceNotFoundException.class);
        assertThat(service.document("acme", ADA, 6L)).isSameAs(other);
    }
}
