package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSeal;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSigner;
import com.taskforce.tf_api.core.model.MissionDossier;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.MissionDossierSealRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

/**
 * Qui lit un dossier qui survit à son issue et à son projet, et qui en efface un texte : un membre de l'espace, et tant
 * que le projet existe, qui le voit ; ensuite, la personne qui a délégué et les responsables de l'espace.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Lire et effacer un dossier qui survit à son issue")
class MissionDossierAccessTest {

    private static final String HASH = "sha256:" + "a".repeat(64);

    @Mock private MissionEvidenceService evidence;
    @Mock private ProjectRepository projects;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private WorkspaceMemberRepository members;
    @Mock private UserRepository users;
    @Mock private WorkspaceRepository workspaces;
    @Mock private MissionDossierSealRepository seals;
    @Mock private EvidenceSigner signer;
    @InjectMocks private MissionDossierAccess access;

    private Workspace workspace;
    private MissionDossier dossier;
    private User ada;

    @BeforeEach
    void setUp() {
        ada = User.builder().id(7L).email("ada@taskforce.dev").build();
        workspace = Workspace.builder().id(3L).slug("acme").build();
        dossier = MissionDossier.builder().runId(100L).workspace(workspace).projectId(12L).delegatedBy(ada).build();
        lenient().when(evidence.dossier(100L)).thenReturn(Optional.of(dossier));
        lenient().when(evidence.dossierJson(100L)).thenReturn(Optional.of("{}"));
    }

    private void role(Long userId, WorkspaceRole role) {
        when(members.findByWorkspaceIdAndUserId(3L, userId))
            .thenReturn(Optional.of(WorkspaceMember.builder().role(role).build()));
    }

    @Test
    @DisplayName("le projet existe : le lit le membre qui voit le projet")
    void while_the_project_lives_its_viewers_read() {
        Project project = Project.builder().id(12L).build();
        when(projects.findById(12L)).thenReturn(Optional.of(project));
        role(8L, WorkspaceRole.MEMBER);

        assertThat(access.export("acme", 100L, 8L, MissionDossierAccess.Format.JSON)).contains("{}");
        verify(visibilityGuard).assertCanView(project, 8L);
    }

    @Test
    @DisplayName("le projet existe, la personne ne le voit pas : refusé")
    void a_private_project_stays_private() {
        Project project = Project.builder().id(12L).build();
        when(projects.findById(12L)).thenReturn(Optional.of(project));
        role(8L, WorkspaceRole.MEMBER);
        doThrow(new ForbiddenException("no")).when(visibilityGuard).assertCanView(project, 8L);

        assertThatThrownBy(() -> access.export("acme", 100L, 8L, MissionDossierAccess.Format.JSON)).isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("R159, L8 : qui n'est pas membre de l'espace ne lit pas, même s'il voit le projet ou a délégué la mission")
    void a_non_member_does_not_read() {
        when(members.findByWorkspaceIdAndUserId(3L, 7L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> access.export("acme", 100L, 7L, MissionDossierAccess.Format.JSON)).isInstanceOf(ForbiddenException.class);
        verify(projects, never()).findById(any());
        verify(evidence, never()).dossierJson(anyLong());
    }

    @Test
    @DisplayName("le projet n'existe plus : la personne qui a délégué, toujours membre, lit encore")
    void after_the_project_the_delegator_reads() {
        when(projects.findById(12L)).thenReturn(Optional.empty());
        role(7L, WorkspaceRole.MEMBER);

        assertThat(access.export("acme", 100L, 7L, MissionDossierAccess.Format.JSON)).contains("{}");
    }

    @ParameterizedTest(name = "le projet n'existe plus, un {0} de l'espace lit encore")
    @EnumSource(value = WorkspaceRole.class, names = {"OWNER", "ADMIN"})
    void after_the_project_the_managers_read(WorkspaceRole role) {
        when(projects.findById(12L)).thenReturn(Optional.empty());
        role(9L, role);

        assertThat(access.export("acme", 100L, 9L, MissionDossierAccess.Format.JSON)).contains("{}");
    }

    @Test
    @DisplayName("le projet n'existe plus : un membre ordinaire ne lit plus")
    void after_the_project_a_member_does_not() {
        when(projects.findById(12L)).thenReturn(Optional.empty());
        role(9L, WorkspaceRole.MEMBER);

        assertThatThrownBy(() -> access.export("acme", 100L, 9L, MissionDossierAccess.Format.JSON)).isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("un dossier d'un autre espace, ou une mission sans dossier, n'existe pas")
    void other_workspaces_do_not_see_it() {
        assertThatThrownBy(() -> access.export("other", 100L, 7L, MissionDossierAccess.Format.JSON))
            .isInstanceOf(ResourceNotFoundException.class);
        when(evidence.dossier(101L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> access.export("acme", 101L, 7L, MissionDossierAccess.Format.JSON))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("les trois formes : le dossier, sa page technique, son sceau seul")
    void the_three_forms() {
        when(projects.findById(12L)).thenReturn(Optional.empty());
        role(7L, WorkspaceRole.MEMBER);
        when(evidence.dossierMarkdown(100L)).thenReturn(Optional.of("# md"));
        when(evidence.envelope(100L)).thenReturn(Optional.of("{\"payloadType\":\"application/vnd.in-toto+json\"}"));

        assertThat(access.export("acme", 100L, 7L, MissionDossierAccess.Format.MARKDOWN)).contains("# md");
        assertThat(access.export("acme", 100L, 7L, MissionDossierAccess.Format.DSSE)).get().asString().contains("in-toto");
    }

    @Test
    @DisplayName("effacer un texte : la personne qui a délégué")
    void the_delegator_erases_a_text() {
        when(projects.findById(12L)).thenReturn(Optional.of(Project.builder().id(12L).build()));
        role(7L, WorkspaceRole.MEMBER);
        when(users.findById(7L)).thenReturn(Optional.of(ada));

        access.eraseText("acme", 100L, HASH, 7L);

        verify(evidence).eraseText(100L, HASH, ada);
    }

    @Test
    @DisplayName("effacer un texte : un membre qui voit le projet ne le peut pas")
    void a_member_does_not_erase() {
        when(projects.findById(12L)).thenReturn(Optional.of(Project.builder().id(12L).build()));
        role(9L, WorkspaceRole.MEMBER);

        assertThatThrownBy(() -> access.eraseText("acme", 100L, HASH, 9L)).isInstanceOf(ForbiddenException.class);
        verify(evidence, never()).eraseText(anyLong(), any(), any());
    }

    /** Une clé qui a scellé des dossiers de l'espace, telle que la base la compte. */
    private static MissionDossierSealRepository.KeyUse use(String id, String first, String last, long count) {
        return new MissionDossierSealRepository.KeyUse() {
            @Override public String getKeyId() { return id; }
            @Override public String getFirstUsed() { return first; }
            @Override public String getLastUsed() { return last; }
            @Override public Long getSeals() { return count; }
        };
    }

    @Test
    @DisplayName("R159, M3 : la clé d'aujourd'hui, et chaque clé qui a scellé des dossiers de l'espace, lue dans son dernier sceau")
    void the_keys_are_read_by_the_members() throws Exception {
        EvidenceSeal.Key current = new EvidenceSeal.Key("sha256:" + "b".repeat(64), "MCowBQYDK2VwAyEA", "separate-machine", true);
        when(workspaces.findBySlug("acme")).thenReturn(Optional.of(workspace));
        when(signer.key()).thenReturn(current);
        role(9L, WorkspaceRole.MEMBER);
        // Une clé d'avant, jetable et sur la machine de l'agent : son dernier sceau le dit.
        var pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        String publicKey = Base64.getEncoder().encodeToString(pair.getPublic().getEncoded());
        EvidenceSeal.Key old = new EvidenceSeal.Key(EvidenceSeal.keyId(pair.getPublic().getEncoded()), publicKey, "same-machine", false);
        when(seals.keysUsedIn(3L)).thenReturn(List.of(use(old.id(), "2026-11-01T08:00:00.000Z", "2026-11-20T17:00:00.000Z", 12)));
        when(seals.lastEnvelopeOf(3L, old.id())).thenReturn(Optional.of(envelope(old, pair.getPrivate())));

        MissionDossierAccess.Keys keys = access.keys("acme", 9L);

        assertThat(keys.current()).isEqualTo(current);
        assertThat(keys.used()).containsExactly(new MissionDossierAccess.UsedKey(old.id(), publicKey, "same-machine", false,
            "2026-11-01T08:00:00.000Z", "2026-11-20T17:00:00.000Z", 12));
    }

    @Test
    @DisplayName("la route des clés : un membre de l'espace la lit, une autre personne non")
    void the_keys_are_for_the_members() {
        when(workspaces.findBySlug("acme")).thenReturn(Optional.of(workspace));
        when(members.findByWorkspaceIdAndUserId(3L, 11L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> access.keys("acme", 11L)).isInstanceOf(ForbiddenException.class);
        when(workspaces.findBySlug("other")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> access.keys("other", 9L)).isInstanceOf(ResourceNotFoundException.class);
        verify(seals, never()).keysUsedIn(anyLong());
    }

    /** L'enveloppe d'un sceau fait par cette clé, comme le serveur l'écrit. */
    private static String envelope(EvidenceSeal.Key key, PrivateKey privateKey) throws Exception {
        ObjectMapper json = new ObjectMapper();
        var header = json.createObjectNode().put("id", 100).put("workspace", "acme");
        var statement = EvidenceSeal.statement(header, "sha256:" + "c".repeat(64), 4, "2026-11-20T17:00:00.000Z", key);
        byte[] payload = EvidenceSeal.payload(statement);
        var signer = java.security.Signature.getInstance("Ed25519");
        signer.initSign(privateKey);
        signer.update(EvidenceSeal.pae(EvidenceSeal.PAYLOAD_TYPE, payload));
        return EvidenceSeal.envelope(payload, key.id(), signer.sign()).toString();
    }
}
