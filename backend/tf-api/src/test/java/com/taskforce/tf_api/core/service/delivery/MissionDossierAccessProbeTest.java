package com.taskforce.tf_api.core.service.delivery;

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
}
