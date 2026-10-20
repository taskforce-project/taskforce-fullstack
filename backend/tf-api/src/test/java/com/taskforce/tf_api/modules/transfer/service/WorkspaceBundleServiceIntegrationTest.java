package com.taskforce.tf_api.modules.transfer.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.WorkspaceService;
import com.taskforce.tf_api.modules.ged.service.ObjectStorage;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

/**
 * Tests d'intégration — {@link WorkspaceBundleService} sur un vrai Postgres : un espace entier (Brain OS et projets)
 * exporté par un membre, puis recréé dans un nouvel espace, avec chaque référence des pages renumérotée.
 */
@DisplayName("WorkspaceBundleService (intégration Postgres)")
@Import({WorkspaceBundleService.class, ProjectBundleService.class, ServerImportedPeople.class, ProjectVisibilityGuard.class})
class WorkspaceBundleServiceIntegrationTest extends AbstractIntegrationTest {

    private static final byte[] PHOTO = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};
    private static final String FILE = "0f1e2d3c4b5a69788796a5b4c3d2e1f0-board.png";

    @Autowired private WorkspaceBundleService service;
    @Autowired private NamedParameterJdbcTemplate jdbc;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;

    @MockitoBean private ProjectService projectService;
    @MockitoBean private WorkspaceService workspaceService;
    @MockitoBean private ObjectStorage objectStorage;

    @TempDir private Path tmp;

    private final Map<String, byte[]> stored = new HashMap<>();
    private User owner;
    private User mate;
    private Workspace acme;
    private long publicProject;
    private long privateProject;
    private long issue;
    private long privateIssue;
    private long root;
    private long child;

    @BeforeEach
    void seed() {
        doAnswer(invocation -> {
            stored.put(invocation.getArgument(0), ((InputStream) invocation.getArgument(1)).readAllBytes());
            return null;
        }).when(objectStorage).upload(anyString(), any(), anyLong(), anyString());
        when(objectStorage.getObjectStream(anyString())).thenAnswer(invocation -> {
            byte[] content = stored.get(invocation.<String>getArgument(0));
            if (content == null) {
                throw new IllegalStateException("missing object");
            }
            return new ByteArrayInputStream(content);
        });
        when(objectStorage.contentType(anyString())).thenReturn("image/png");
        when(projectService.uniqueIdentifier(anyLong(), anyString())).thenAnswer(invocation -> invocation.getArgument(1));
        when(workspaceService.uniqueSlug(anyString())).thenAnswer(invocation -> "acme-copy");

        owner = userRepository.save(User.builder().keycloakId("kc-ws-owner").email("owner@ws.dev").displayName("Owner")
            .isActive(true).build());
        mate = userRepository.save(User.builder().keycloakId("kc-ws-mate").email("mate@ws.dev").displayName("Mate")
            .isActive(true).build());
        acme = workspaceRepository.save(Workspace.builder().name("Acme").slug("acme-ws").owner(owner)
            .description("Our team").activity("Software").build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(acme).user(owner).role(WorkspaceRole.OWNER).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(acme).user(mate).role(WorkspaceRole.MEMBER).build());

        publicProject = project("Apollo", "APO", true);
        privateProject = project("Secret", "SEC", false);
        issue = issue(publicProject, 1, "Fix login");
        privateIssue = issue(privateProject, 1, "Secret plan");

        long brain = id("INSERT INTO brain_workspaces (workspace_id, created_by) VALUES (:w, :u)",
            Map.of("w", acme.getId(), "u", String.valueOf(owner.getId())));
        root = node(brain, "Handbook", "See ![board](/api/files/brain/" + acme.getId() + "/" + FILE + ")", null, null,
            "{\"issueId\": " + issue + ", \"generatedBy\": \"ai\"}", null);
        child = node(brain, "Onboarding", "First week", null, null, "{}", root);
        node(brain, "Fix login notes", "Context", "ISSUE", issue, "{}", null);
        node(brain, "Secret notes", "Hidden", "ISSUE", privateIssue, "{}", null);
        node(brain, "Secret project", "Hidden", "PROJECT", privateProject, "{}", null);
        jdbc.update("INSERT INTO knowledge_edges (workspace_id, from_node_id, to_node_id, relation_type, created_by) "
            + "VALUES (:w, :f, :t, 'LINKS_TO', :u)", Map.of("w", acme.getId(), "f", root, "t", child, "u", String.valueOf(mate.getId())));
        stored.put("brain/" + acme.getId() + "/" + FILE, PHOTO);
    }

    private long id(String sql, Map<String, ?> params) {
        return jdbc.queryForObject(sql + " RETURNING id", params, Long.class);
    }

    private long project(String name, String identifier, boolean isPublic) {
        long project = id("INSERT INTO projects (workspace_id, name, identifier, created_by, is_public) "
            + "VALUES (:w, :n, :i, :u, :p)", Map.of("w", acme.getId(), "n", name, "i", identifier, "u", owner.getId(), "p", isPublic));
        jdbc.update("INSERT INTO project_members (project_id, user_id, role) VALUES (:p, :u, 'LEAD')",
            Map.of("p", project, "u", owner.getId()));
        id("INSERT INTO issue_statuses (project_id, name, category, is_default) VALUES (:p, 'Todo', 'UNSTARTED', true)",
            Map.of("p", project));
        return project;
    }

    private long issue(long project, int number, String title) {
        long status = jdbc.queryForObject("SELECT id FROM issue_statuses WHERE project_id = :p", Map.of("p", project), Long.class);
        return id("INSERT INTO issues (project_id, sequence_number, title, status_id, reporter_id) VALUES (:p, :n, :t, :s, :u)",
            Map.of("p", project, "n", number, "t", title, "s", status, "u", owner.getId()));
    }

    private long node(long brain, String title, String content, String refType, Long refId, String metadata, Long parent) {
        Map<String, Object> params = new HashMap<>();
        params.put("w", acme.getId());
        params.put("b", brain);
        params.put("t", title);
        params.put("c", content);
        params.put("rt", refType);
        params.put("ri", refId);
        params.put("m", metadata);
        params.put("p", parent);
        params.put("u", String.valueOf(mate.getId()));
        return id("INSERT INTO knowledge_nodes (workspace_id, brain_id, type, domain, title, content, ref_type, ref_id, "
            + "metadata, parent_node_id, created_by) VALUES (:w, :b, 'NOTE', 'GENERAL', :t, :c, :rt, :ri, CAST(:m AS jsonb), :p, :u)",
            params);
    }

    private Path exported(Long userId) throws IOException {
        WorkspaceBundleService.Export export = service.export("acme-ws", userId);
        Path file = tmp.resolve(export.fileName());
        try (var out = Files.newOutputStream(file)) {
            service.write(export, out);
        }
        return file;
    }

    private long count(String sql, long workspace) {
        return jdbc.queryForObject(sql, Map.of("w", workspace), Long.class);
    }

    @Test
    @DisplayName("un espace entier passe d'un côté à l'autre : projets visibles, Brain OS, fichiers, références renumérotées")
    void moves_a_whole_workspace() throws IOException {
        Path file = exported(mate.getId());
        assertThat(file.getFileName().toString()).matches("acme-ws-\\d{4}-\\d{2}-\\d{2}\\.taskforce-workspace\\.zip");

        Workspace copy = service.importBundle(owner.getId(), file);

        assertThat(copy.getId()).isNotEqualTo(acme.getId());
        assertThat(copy.getName()).isEqualTo("Acme");
        assertThat(copy.getSlug()).isEqualTo("acme-copy");
        assertThat(copy.getDescription()).isEqualTo("Our team");
        assertThat(workspaceMemberRepository.existsByWorkspaceIdAndUserId(copy.getId(), owner.getId())).isTrue();
        // Seul le projet que le membre voit voyage, avec son ticket.
        assertThat(jdbc.queryForList("SELECT identifier FROM projects WHERE workspace_id = :w", Map.of("w", copy.getId()),
            String.class)).containsExactly("APO");
        long newIssue = jdbc.queryForObject("SELECT i.id FROM issues i JOIN projects p ON p.id = i.project_id "
            + "WHERE p.workspace_id = :w", Map.of("w", copy.getId()), Long.class);

        // Brain OS : un seul par espace, les pages des projets invisibles restent de côté.
        assertThat(count("SELECT count(*) FROM brain_workspaces WHERE workspace_id = :w", copy.getId())).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT title FROM knowledge_nodes WHERE workspace_id = :w ORDER BY title",
            Map.of("w", copy.getId()), String.class)).containsExactly("Fix login notes", "Handbook", "Onboarding");
        Map<String, Object> handbook = jdbc.queryForMap("SELECT id, uuid::text AS uuid, content, metadata::text AS metadata, "
            + "brain_id, created_by FROM knowledge_nodes WHERE workspace_id = :w AND title = 'Handbook'", Map.of("w", copy.getId()));
        assertThat((String) handbook.get("content")).contains("/api/files/brain/" + copy.getId() + "/" + FILE)
            .doesNotContain("/api/files/brain/" + acme.getId() + "/");
        assertThat((String) handbook.get("metadata")).contains("\"issueId\": " + newIssue).contains("generatedBy");
        assertThat(handbook.get("created_by")).isEqualTo(String.valueOf(owner.getId()));
        assertThat(handbook.get("uuid")).isNotEqualTo(jdbc.queryForObject(
            "SELECT uuid::text FROM knowledge_nodes WHERE id = :id", Map.of("id", root), String.class));
        // La sous-page pointe sur la nouvelle page parente, la page du ticket sur le nouveau ticket.
        assertThat(jdbc.queryForObject("SELECT parent_node_id FROM knowledge_nodes WHERE workspace_id = :w "
            + "AND title = 'Onboarding'", Map.of("w", copy.getId()), Long.class)).isEqualTo(handbook.get("id"));
        assertThat(jdbc.queryForObject("SELECT ref_id FROM knowledge_nodes WHERE workspace_id = :w AND title = 'Fix login notes'",
            Map.of("w", copy.getId()), Long.class)).isEqualTo(newIssue);
        assertThat(count("SELECT count(*) FROM knowledge_edges e JOIN knowledge_nodes f ON f.id = e.from_node_id "
            + "WHERE e.workspace_id = :w AND f.workspace_id = :w", copy.getId())).isEqualTo(1);
        // Le fichier montré par la page est rangé dans le stockage du nouvel espace.
        assertThat(stored.get("brain/" + copy.getId() + "/" + FILE)).isEqualTo(PHOTO);
    }

    @Test
    @DisplayName("seuls les membres de l'espace l'exportent")
    void only_members_export() {
        User stranger = userRepository.save(User.builder().keycloakId("kc-ws-x").email("x@ws.dev").isActive(true).build());

        assertThatThrownBy(() -> service.export("acme-ws", stranger.getId())).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("un fichier qui n'est pas un fichier d'espace est refusé avec un message clair")
    void refuses_other_files() throws IOException {
        Path text = Files.writeString(tmp.resolve("notes.zip"), "not a zip");
        Path project = tmp.resolve("project.zip");
        try (var out = new java.util.zip.ZipOutputStream(Files.newOutputStream(project))) {
            out.putNextEntry(new java.util.zip.ZipEntry("project.json"));
            out.write("{\"format\":\"taskforce-project\"}".getBytes(StandardCharsets.UTF_8));
            out.closeEntry();
        }

        for (Path file : new Path[] {text, project}) {
            assertThatThrownBy(() -> service.importBundle(owner.getId(), file))
                .isInstanceOf(BusinessException.class).hasMessage(WorkspaceBundleService.NOT_A_BUNDLE);
        }
    }
}
