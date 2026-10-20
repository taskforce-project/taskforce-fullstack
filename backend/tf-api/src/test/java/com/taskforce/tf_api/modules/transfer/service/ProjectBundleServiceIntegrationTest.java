package com.taskforce.tf_api.modules.transfer.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.modules.ged.service.ObjectStorage;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

/**
 * Tests d'intégration — {@link ProjectBundleService} sur un vrai Postgres : un projet complet est exporté puis recréé
 * dans un autre espace, table par table, avec ses dates, ses liens et ses pièces jointes. Stockage en mémoire.
 */
@DisplayName("ProjectBundleService (intégration Postgres)")
@Import({ProjectBundleService.class, ServerImportedPeople.class, ProjectVisibilityGuard.class})
class ProjectBundleServiceIntegrationTest extends AbstractIntegrationTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final byte[] PDF = "%PDF-1.7 spec".getBytes(StandardCharsets.UTF_8);

    @Autowired private ProjectBundleService service;
    @Autowired private NamedParameterJdbcTemplate jdbc;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;

    @MockitoBean private ProjectService projectService;
    @MockitoBean private ObjectStorage objectStorage;

    @TempDir private Path tmp;

    private final Map<String, byte[]> stored = new HashMap<>();
    private User owner;
    private User mate;
    private Workspace source;
    private Workspace target;
    private long projectId;
    private long parentIssue;
    private long childIssue;

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
        // Comme ProjectService : un identifiant déjà pris dans l'espace est suffixé (APO → APO2).
        when(projectService.uniqueIdentifier(anyLong(), anyString())).thenAnswer(invocation -> {
            Long workspaceId = invocation.getArgument(0);
            String base = invocation.getArgument(1);
            Long taken = jdbc.queryForObject("SELECT count(*) FROM projects WHERE workspace_id = :w AND identifier = :i",
                Map.of("w", workspaceId, "i", base), Long.class);
            return taken != null && taken > 0 ? base + "2" : base;
        });

        owner = userRepository.save(User.builder().keycloakId("kc-owner").email("owner@bundle.dev").displayName("Owner")
            .isActive(true).build());
        mate = userRepository.save(User.builder().keycloakId("kc-mate").email("mate@bundle.dev").displayName("Mate")
            .isActive(true).build());
        source = workspace("bundle-source", owner, mate);
        target = workspace("bundle-target", owner);

        projectId = id("INSERT INTO projects (workspace_id, name, identifier, created_by, is_public, created_at, updated_at) "
            + "VALUES (:ws, 'Apollo', 'APO', :owner, true, '2026-01-02T03:04:05', '2026-01-03T03:04:05')",
            Map.of("ws", source.getId(), "owner", owner.getId()));
        long todo = id("INSERT INTO issue_statuses (project_id, name, category, position, is_default) "
            + "VALUES (:p, 'Todo', 'UNSTARTED', 0, true)", Map.of("p", projectId));
        long done = id("INSERT INTO issue_statuses (project_id, name, category, position) VALUES (:p, 'Done', 'COMPLETED', 1)",
            Map.of("p", projectId));
        long bug = id("INSERT INTO issue_types (project_id, name, is_default) VALUES (:p, 'Bug', true)", Map.of("p", projectId));
        long label = id("INSERT INTO project_labels (project_id, name) VALUES (:p, 'Backend')", Map.of("p", projectId));
        long cycle = id("INSERT INTO cycles (project_id, name, status, created_by) VALUES (:p, 'Sprint 1', 'ACTIVE', :u)",
            Map.of("p", projectId, "u", mate.getId()));
        id("INSERT INTO pages (project_id, title, content, created_by) VALUES (:p, 'Spec', '# Spec', :u)",
            Map.of("p", projectId, "u", owner.getId()));

        parentIssue = issue(1, "Parent", todo, bug, null, "2025-12-01T10:00:00", null);
        childIssue = issue(2, "Child", done, null, parentIssue, "2025-12-02T10:00:00", null);
        long archived = issue(7, "Archived", done, null, null, "2025-12-03T10:00:00", "2026-01-01T00:00:00");

        jdbc.update("INSERT INTO issue_label_assignments (issue_id, label_id) VALUES (:i, :l)",
            Map.of("i", parentIssue, "l", label));
        id("INSERT INTO issue_comments (issue_id, author_id, content, created_at) "
            + "VALUES (:i, :u, 'Looks good', '2025-12-05T09:00:00')", Map.of("i", parentIssue, "u", mate.getId()));
        id("INSERT INTO issue_activity (issue_id, actor_id, action, new_value) VALUES (:i, :u, 'CREATED', 'Parent')",
            Map.of("i", parentIssue, "u", owner.getId()));
        id("INSERT INTO issue_checklist_items (issue_id, content, is_done) VALUES (:i, 'Write tests', true)",
            Map.of("i", parentIssue));
        id("INSERT INTO issue_worklogs (issue_id, user_id, minutes, logged_at) VALUES (:i, :u, 90, '2025-12-06')",
            Map.of("i", parentIssue, "u", mate.getId()));
        id("INSERT INTO issue_relations (source_id, target_id, relation_type, created_by) VALUES (:s, :t, 'BLOCKS', :u)",
            Map.of("s", parentIssue, "t", archived, "u", owner.getId()));
        id("INSERT INTO cycle_issues (cycle_id, issue_id, added_by) VALUES (:c, :i, :u)",
            Map.of("c", cycle, "i", childIssue, "u", owner.getId()));
        id("INSERT INTO issue_github_links (issue_id, link_type, repo_full_name, pr_number, status) "
            + "VALUES (:i, 'PR', 'acme/apollo', 12, 'MERGED')", Map.of("i", parentIssue));
        String key = "issues/" + parentIssue + "/spec.pdf";
        stored.put(key, PDF);
        id("INSERT INTO attachments (issue_id, uploaded_by, original_name, stored_key, content_type, file_size) "
            + "VALUES (:i, :u, 'spec.pdf', :k, 'application/pdf', :s)",
            Map.of("i", parentIssue, "u", owner.getId(), "k", key, "s", PDF.length));
    }

    private Workspace workspace(String slug, User... members) {
        Workspace workspace = workspaceRepository.save(Workspace.builder().name(slug).slug(slug).owner(owner).build());
        for (User member : members) {
            workspaceMemberRepository.save(WorkspaceMember.builder().workspace(workspace).user(member)
                .role(member == owner ? WorkspaceRole.OWNER : WorkspaceRole.MEMBER).build());
        }
        return workspace;
    }

    private long id(String sql, Map<String, ?> params) {
        return jdbc.queryForObject(sql + " RETURNING id", params, Long.class);
    }

    private long issue(int number, String title, long status, Long type, Long parent, String createdAt, String archivedAt) {
        Map<String, Object> params = new HashMap<>();
        params.put("p", projectId);
        params.put("n", number);
        params.put("t", title);
        params.put("s", status);
        params.put("type", type);
        params.put("parent", parent);
        params.put("owner", owner.getId());
        params.put("mate", mate.getId());
        params.put("created", createdAt);
        params.put("archived", archivedAt);
        return id("INSERT INTO issues (project_id, sequence_number, title, status_id, type_id, parent_id, reporter_id, "
            + "assignee_id, priority, created_at, updated_at, archived_at) VALUES (:p, :n, :t, :s, :type, :parent, :owner, "
            + ":mate, 'HIGH', CAST(:created AS timestamp), CAST(:created AS timestamp), CAST(:archived AS timestamp))", params);
    }

    /** Fichier du projet, écrit comme le contrôleur l'écrit. */
    private Path exported() throws IOException {
        ProjectBundleService.Export export = service.export("bundle-source", projectId, owner.getId());
        Path file = tmp.resolve(export.fileName());
        try (var out = Files.newOutputStream(file)) {
            service.write(export, out);
        }
        return file;
    }

    private static Map<String, byte[]> entries(Path zip) throws IOException {
        Map<String, byte[]> entries = new HashMap<>();
        try (ZipInputStream in = new ZipInputStream(Files.newInputStream(zip))) {
            for (ZipEntry entry = in.getNextEntry(); entry != null; entry = in.getNextEntry()) {
                entries.put(entry.getName(), in.readAllBytes());
            }
        }
        return entries;
    }

    private Path zip(String manifest, Map<String, byte[]> files) throws IOException {
        Path file = Files.createTempFile(tmp, "bundle-", ".zip");
        try (ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(file))) {
            if (manifest != null) {
                out.putNextEntry(new ZipEntry("project.json"));
                out.write(manifest.getBytes(StandardCharsets.UTF_8));
                out.closeEntry();
            }
            for (Map.Entry<String, byte[]> entry : files.entrySet()) {
                out.putNextEntry(new ZipEntry(entry.getKey()));
                out.write(entry.getValue());
                out.closeEntry();
            }
        }
        return file;
    }

    private long count(String sql, long project) {
        return jdbc.queryForObject(sql, Map.of("p", project), Long.class);
    }

    @Test
    @DisplayName("export : tout le projet, sous-tickets et archivés compris, les personnes citées, et chaque pièce jointe")
    void exports_the_whole_project() throws IOException {
        Path file = exported();

        assertThat(file.getFileName().toString()).matches("APO-\\d{4}-\\d{2}-\\d{2}\\.taskforce\\.zip");
        Map<String, byte[]> entries = entries(file);
        JsonNode manifest = JSON.readTree(entries.get("project.json"));
        assertThat(manifest.path("format").asText()).isEqualTo("taskforce-project");
        assertThat(manifest.path("version").asInt()).isEqualTo(1);
        assertThat(manifest.path("tables").path("issues")).hasSize(3);
        assertThat(manifest.path("tables").path("issue_statuses")).hasSize(2);
        assertThat(manifest.path("people").findValuesAsText("email"))
            .containsExactlyInAnyOrder("owner@bundle.dev", "mate@bundle.dev");
        long attachmentId = manifest.path("tables").path("attachments").get(0).path("id").asLong();
        assertThat(entries.get("files/" + attachmentId)).isEqualTo(PDF);
    }

    @Test
    @DisplayName("export : un projet privé reste invisible à qui n'en est pas membre")
    void a_private_project_is_not_exported_to_a_stranger() {
        jdbc.update("UPDATE projects SET is_public = false WHERE id = :p", Map.of("p", projectId));

        assertThatThrownBy(() -> service.export("bundle-source", projectId, mate.getId()))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("import : le projet est recréé avec ses dates, ses numéros, ses liens et ses pièces jointes")
    void imports_the_project_in_another_workspace() throws IOException {
        Path file = exported();

        long imported = service.importBundle("bundle-target", owner.getId(), file);

        assertThat(imported).isNotEqualTo(projectId);
        Map<String, Object> project = jdbc.queryForMap("SELECT workspace_id, name, identifier, created_at::text AS created "
            + "FROM projects WHERE id = :p", Map.of("p", imported));
        assertThat(project).containsEntry("workspace_id", target.getId()).containsEntry("name", "Apollo")
            .containsEntry("identifier", "APO").containsEntry("created", "2026-01-02 03:04:05");
        assertThat(jdbc.queryForList("SELECT sequence_number FROM issues WHERE project_id = :p ORDER BY 1",
            Map.of("p", imported), Integer.class)).containsExactly(1, 2, 7);
        assertThat(count("SELECT count(*) FROM issues WHERE project_id = :p AND archived_at IS NOT NULL", imported)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT created_at::text FROM issues WHERE project_id = :p AND sequence_number = 1",
            Map.of("p", imported), String.class)).isEqualTo("2025-12-01 10:00:00");
        // Le sous-ticket pointe sur le nouveau parent, le statut et le type sur ceux du nouveau projet.
        assertThat(count("SELECT count(*) FROM issues c JOIN issues p ON p.id = c.parent_id WHERE c.project_id = :p "
            + "AND p.project_id = :p AND p.sequence_number = 1", imported)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM issues i JOIN issue_statuses s ON s.id = i.status_id "
            + "WHERE i.project_id = :p AND s.project_id = :p", imported)).isEqualTo(3);
        assertThat(count("SELECT count(*) FROM issue_label_assignments a JOIN project_labels l ON l.id = a.label_id "
            + "WHERE l.project_id = :p", imported)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM issue_relations r JOIN issues s ON s.id = r.source_id "
            + "JOIN issues t ON t.id = r.target_id WHERE s.project_id = :p AND t.project_id = :p", imported)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM cycle_issues ci JOIN cycles c ON c.id = ci.cycle_id WHERE c.project_id = :p",
            imported)).isEqualTo(1);
        for (String table : List.of("issue_comments", "issue_activity", "issue_checklist_items", "issue_worklogs",
                "issue_github_links", "attachments")) {
            assertThat(count("SELECT count(*) FROM " + table + " WHERE issue_id IN (SELECT id FROM issues WHERE project_id = :p)",
                imported)).as(table).isEqualTo(1);
        }
        assertThat(count("SELECT count(*) FROM pages WHERE project_id = :p", imported)).isEqualTo(1);
        // La pièce jointe est rangée sous le nouveau ticket, avec son contenu.
        String key = jdbc.queryForObject("SELECT stored_key FROM attachments WHERE issue_id IN "
            + "(SELECT id FROM issues WHERE project_id = :p)", Map.of("p", imported), String.class);
        assertThat(key).startsWith("issues/").endsWith(".pdf").doesNotContain("/" + parentIssue + "/");
        assertThat(stored.get(key)).isEqualTo(PDF);
        // Le prochain ticket prend le numéro 8, et la personne qui importe mène le projet.
        assertThat(count("SELECT last_number FROM issue_sequence_counters WHERE project_id = :p", imported)).isEqualTo(7);
        assertThat(jdbc.queryForObject("SELECT role::text FROM project_members WHERE project_id = :p AND user_id = :u",
            Map.of("p", imported, "u", owner.getId()), String.class)).isEqualTo("LEAD");
    }

    @Test
    @DisplayName("import sur le serveur : une personne qui n'est pas membre de l'espace cède sa place à qui importe")
    void people_outside_the_workspace_become_the_importer() throws IOException {
        long imported = service.importBundle("bundle-target", owner.getId(), exported());

        assertThat(jdbc.queryForObject("SELECT author_id FROM issue_comments WHERE issue_id IN "
            + "(SELECT id FROM issues WHERE project_id = :p)", Map.of("p", imported), Long.class)).isEqualTo(owner.getId());
        assertThat(count("SELECT count(*) FROM issues WHERE project_id = :p AND assignee_id = " + owner.getId(), imported))
            .isEqualTo(3);
    }

    @Test
    @DisplayName("import sur le serveur : un membre de l'espace garde ses commentaires et entre dans le projet")
    void members_of_the_workspace_keep_their_work() throws IOException {
        long imported = service.importBundle("bundle-source", owner.getId(), exported());

        assertThat(jdbc.queryForObject("SELECT author_id FROM issue_comments WHERE issue_id IN "
            + "(SELECT id FROM issues WHERE project_id = :p)", Map.of("p", imported), Long.class)).isEqualTo(mate.getId());
        assertThat(jdbc.queryForObject("SELECT role::text FROM project_members WHERE project_id = :p AND user_id = :u",
            Map.of("p", imported, "u", mate.getId()), String.class)).isEqualTo("MEMBER");
    }

    @Test
    @DisplayName("import : une ligne qui cite ce qui n'est pas dans le fichier reste de côté, une colonne inconnue est ignorée")
    void the_file_is_never_taken_at_its_word() throws IOException {
        ObjectNode manifest = (ObjectNode) JSON.readTree(entries(exported()).get("project.json"));
        ObjectNode comment = (ObjectNode) manifest.path("tables").path("issue_comments").get(0);
        comment.put("issue_id", 999_999_999L);
        ObjectNode page = (ObjectNode) manifest.path("tables").path("pages").get(0);
        page.put("id", 1);
        page.put("title\" text); DROP TABLE pages; --", "x");

        long imported = service.importBundle("bundle-target", owner.getId(), zip(manifest.toString(), Map.of()));

        assertThat(count("SELECT count(*) FROM issue_comments WHERE issue_id IN (SELECT id FROM issues WHERE project_id = :p)",
            imported)).isZero();
        assertThat(count("SELECT count(*) FROM pages WHERE project_id = :p", imported)).isEqualTo(1);
        // Sans son contenu dans le fichier, la pièce jointe n'est pas recréée.
        assertThat(count("SELECT count(*) FROM attachments WHERE issue_id IN (SELECT id FROM issues WHERE project_id = :p)",
            imported)).isZero();
    }

    @Test
    @DisplayName("import : refusé à qui n'est pas membre de l'espace")
    void only_members_import() throws IOException {
        Path file = exported();

        assertThatThrownBy(() -> service.importBundle("bundle-target", mate.getId(), file))
            .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("import : un fichier qui n'est pas un fichier de projet est refusé avec un message clair")
    void refuses_other_files() throws IOException {
        Path text = Files.writeString(tmp.resolve("notes.zip"), "not a zip");
        Path empty = zip(null, Map.of("readme.txt", new byte[] {1}));
        Path other = zip("{\"format\":\"something-else\"}", Map.of());
        Path newer = zip("{\"format\":\"taskforce-project\",\"version\":99,\"tables\":{}}", Map.of());

        for (Path file : List.of(text, empty, other)) {
            assertThatThrownBy(() -> service.importBundle("bundle-target", owner.getId(), file))
                .isInstanceOf(BusinessException.class).hasMessage(ProjectBundleService.NOT_A_BUNDLE);
        }
        assertThatThrownBy(() -> service.importBundle("bundle-target", owner.getId(), newer))
            .isInstanceOf(BusinessException.class).hasMessage(ProjectBundleService.NEWER_VERSION);
    }

    @Test
    @DisplayName("lecture bornée : au-delà de la limite, le fichier est refusé")
    void reading_is_bounded() {
        assertThatThrownBy(() -> ProjectBundleService.readAtMost(new ByteArrayInputStream(new byte[11]), 10))
            .isInstanceOf(BusinessException.class).hasMessage(ProjectBundleService.TOO_LARGE);
        assertThatThrownBy(() -> ProjectBundleService.copyAtMost(new ByteArrayInputStream(new byte[11]),
            new ByteArrayOutputStream(), 10)).isInstanceOf(BusinessException.class);
    }
}
