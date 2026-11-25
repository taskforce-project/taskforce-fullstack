package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.harness.evidence.EvidenceSigner;
import com.taskforce.tf_api.core.model.MissionDossier;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.repository.MissionDossierSealRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

/**
 * La sonde L8 de la relecture R159 de #551, écrite pour tourner aussi sur le code d'avant le correctif (68964f2d), où elle
 * échoue : le service laissait à l'intercepteur des routes seul le soin de vérifier l'appartenance à l'espace, et la
 * personne qui avait délégué puis quitté l'espace lisait encore le dossier d'un projet supprimé.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Lire un dossier, sonde L8 de la relecture R159 (#551)")
class MissionDossierAccessProbeTest {

    @Mock private MissionEvidenceService evidence;
    @Mock private ProjectRepository projects;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private WorkspaceMemberRepository members;
    @Mock private UserRepository users;
    @Mock private WorkspaceRepository workspaces;
    @Mock private MissionDossierSealRepository seals;
    @Mock private EvidenceSigner signer;
    @Mock private com.taskforce.tf_api.core.repository.MissionDossierRepository dossiers;
    @InjectMocks private MissionDossierAccess access;

    @Test
    @DisplayName("la personne qui a délégué, sortie de l'espace, ne lit plus le dossier, même son projet supprimé")
    void a_delegator_who_left_the_workspace_no_longer_reads() {
        User ada = User.builder().id(7L).email("ada@taskforce.dev").build();
        Workspace workspace = Workspace.builder().id(3L).slug("acme").build();
        MissionDossier dossier = MissionDossier.builder().runId(100L).workspace(workspace).projectId(12L).delegatedBy(ada).build();
        when(evidence.dossier(100L)).thenReturn(Optional.of(dossier));
        lenient().when(projects.findById(12L)).thenReturn(Optional.empty());
        lenient().when(members.findByWorkspaceIdAndUserId(3L, 7L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> access.export("acme", 100L, 7L, MissionDossierAccess.Format.JSON))
            .isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("R159 second tour, N4 : le JSON et le sceau d'un dossier d'avant la 1.18 ne s'exportent que pour un responsable")
    void a_record_from_before_1_18_exports_only_for_a_manager() {
        Workspace workspace = Workspace.builder().id(3L).slug("acme").build();
        MissionDossier dossier = MissionDossier.builder().runId(100L).workspace(workspace).projectId(12L).build();
        when(evidence.dossier(100L)).thenReturn(Optional.of(dossier));
        lenient().when(projects.findById(12L)).thenReturn(Optional.of(com.taskforce.tf_api.core.model.Project.builder().id(12L).build()));
        lenient().when(evidence.legacy(100L)).thenReturn(true);
        lenient().when(evidence.dossierJson(100L)).thenReturn(Optional.of("{}"));
        lenient().when(evidence.dossierMarkdown(100L)).thenReturn(Optional.of("# Evidence"));
        lenient().when(members.findByWorkspaceIdAndUserId(3L, 8L)).thenReturn(Optional.of(WorkspaceMember.builder()
            .role(WorkspaceRole.MEMBER).build()));
        lenient().when(members.findByWorkspaceIdAndUserId(3L, 9L)).thenReturn(Optional.of(WorkspaceMember.builder()
            .role(WorkspaceRole.ADMIN).build()));

        assertThatThrownBy(() -> access.export("acme", 100L, 8L, MissionDossierAccess.Format.JSON))
            .isInstanceOf(ForbiddenException.class).hasMessageContaining("before TaskForce 1.18");
        assertThatThrownBy(() -> access.export("acme", 100L, 8L, MissionDossierAccess.Format.DSSE))
            .isInstanceOf(ForbiddenException.class);
        assertThat(access.export("acme", 100L, 8L, MissionDossierAccess.Format.MARKDOWN)).contains("# Evidence");
        assertThat(access.export("acme", 100L, 9L, MissionDossierAccess.Format.JSON)).contains("{}");
    }

    @Test
    @DisplayName("R159 second tour, M-b : le lien du témoin mène à son dossier pour qui peut le lire, et ne dit rien aux autres")
    void a_witness_link_keeps_its_access_checks() {
        Workspace workspace = Workspace.builder().id(3L).slug("acme").build();
        MissionDossier dossier = MissionDossier.builder().runId(100L).workspace(workspace).projectId(12L).build();
        String link = "0123456789abcdef0123456789abcdef";
        lenient().when(dossiers.findByLinkId(link)).thenReturn(Optional.of(dossier));
        lenient().when(evidence.dossier(100L)).thenReturn(Optional.of(dossier));
        lenient().when(projects.findById(12L)).thenReturn(Optional.of(com.taskforce.tf_api.core.model.Project.builder().id(12L).build()));
        lenient().when(members.findByWorkspaceIdAndUserId(3L, 8L)).thenReturn(Optional.of(WorkspaceMember.builder().build()));
        lenient().when(members.findByWorkspaceIdAndUserId(3L, 7L)).thenReturn(Optional.empty());

        assertThat(access.byLink(link, 8L)).isEqualTo(new MissionDossierAccess.Linked("acme", 100L));
        // Quelqu'un hors de l'espace, ou un lien qui ne mène à rien : la même réponse, sans dire lequel.
        assertThatThrownBy(() -> access.byLink(link, 7L)).isInstanceOf(com.taskforce.tf_api.shared.exception.ResourceNotFoundException.class);
        assertThatThrownBy(() -> access.byLink("f".repeat(32), 8L))
            .isInstanceOf(com.taskforce.tf_api.shared.exception.ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("R159 troisième tour, c-e (sonde F) : un id inconnu, un non-membre, un membre qui ne voit pas le projet privé : le même message")
    void a_witness_link_says_the_same_to_whoever_cannot_read() {
        Workspace workspace = Workspace.builder().id(3L).slug("acme").build();
        com.taskforce.tf_api.core.model.Project secret = com.taskforce.tf_api.core.model.Project.builder().id(12L).build();
        MissionDossier dossier = MissionDossier.builder().runId(100L).workspace(workspace).projectId(12L).build();
        String link = "0123456789abcdef0123456789abcdef";
        lenient().when(dossiers.findByLinkId(link)).thenReturn(Optional.of(dossier));
        lenient().when(evidence.dossier(100L)).thenReturn(Optional.of(dossier));
        lenient().when(projects.findById(12L)).thenReturn(Optional.of(secret));
        lenient().when(members.findByWorkspaceIdAndUserId(3L, 7L)).thenReturn(Optional.empty());
        lenient().when(members.findByWorkspaceIdAndUserId(3L, 9L)).thenReturn(Optional.of(WorkspaceMember.builder()
            .role(WorkspaceRole.MEMBER).build()));
        // Comme le garde le fait pour un projet privé qu'on ne voit pas.
        org.mockito.Mockito.lenient().doThrow(new com.taskforce.tf_api.shared.exception.ResourceNotFoundException("Project not found"))
            .when(visibilityGuard).assertCanView(secret, 9L);

        for (Runnable reader : java.util.List.<Runnable>of(() -> access.byLink("f".repeat(32), 9L), () -> access.byLink(link, 7L),
            () -> access.byLink(link, 9L))) {
            assertThatThrownBy(reader::run).isInstanceOf(com.taskforce.tf_api.shared.exception.ResourceNotFoundException.class)
                .hasMessage(MissionDossierAccess.NOT_FOUND);
        }
    }
}
