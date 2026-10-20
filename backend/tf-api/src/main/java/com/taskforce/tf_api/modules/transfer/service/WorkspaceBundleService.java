package com.taskforce.tf_api.modules.transfer.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.WorkspaceService;
import com.taskforce.tf_api.modules.ged.service.ObjectStorage;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Un espace entier dans un fichier : l'espace, son Brain OS (pages, liens entre elles, fichiers) et tous les projets
 * que la personne y voit, chacun comme dans un fichier de projet ({@link ProjectBundleService}). C'est ainsi que tout le
 * travail d'une personne passe de la webapp à l'app desktop et inversement : l'import crée un nouvel espace, dont elle
 * est propriétaire.
 *
 * <p>Archive : {@code workspace.json} (l'espace et son Brain OS, lignes telles que PostgreSQL les rend),
 * {@code projects/<id>/} (un fichier de projet par projet) et {@code brain-files/<nom>} (les fichiers que les pages du
 * Brain OS montrent). Comme pour un projet, le fichier n'est jamais cru sur parole : identifiants renumérotés,
 * références des pages (projet, ticket, cycle) passées par la correspondance des projets importés, adresses des
 * fichiers réécrites, identifiant unique des pages tiré à neuf, vecteurs de recherche laissés de côté (recalculés).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkspaceBundleService {

    static final String FORMAT = "taskforce-workspace";

    /** Version du format ; un fichier d'une version plus récente est refusé. */
    static final int VERSION = 1;

    static final String MANIFEST = "workspace.json";
    static final String PROJECTS = "projects/";
    static final String BRAIN_FILES = "brain-files/";

    public static final String NOT_A_BUNDLE = "This file isn't a TaskForce workspace file.";
    public static final String NEWER_VERSION =
        "This workspace file comes from a newer version of TaskForce. Update TaskForce, then import it again.";

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern FILE_NAME = Pattern.compile("[A-Za-z0-9._-]{1,255}");
    /** Colonnes des pages du Brain OS qui ne voyagent pas : propres à cette base (vecteurs de recherche). */
    private static final Set<String> NODE_LOCAL_COLUMNS = Set.of("id", "embedding", "embedding_model");
    /** Références des pages vers les projets, tickets et cycles (sans clé étrangère). */
    private static final Map<String, String> NODE_REFS = Map.of("PROJECT", "projects", "ISSUE", "issues", "CYCLE", "cycles");
    /** Identifiants cités dans le {@code metadata} des pages. */
    private static final Map<String, String> METADATA_REFS = Map.of("projectId", "projects", "issueId", "issues", "cycleId", "cycles");

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final ProjectRepository projectRepository;
    private final ProjectVisibilityGuard visibilityGuard;
    private final ProjectBundleService projects;
    private final WorkspaceService workspaceService;
    private final UserRepository userRepository;
    private final ObjectStorage objectStorage;
    private final ImportedPeople importedPeople;

    /** Fichier d'espace prêt à écrire. */
    public record Export(String fileName, byte[] manifest, Map<Long, ProjectBundleService.Export> projects, Long workspaceId,
                         Set<String> brainFiles) {
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Export
    // ---------------------------------------------------------------------------------------------------------------

    /**
     * Lit un espace dont la personne est membre : l'espace, ses projets qu'elle voit, et son Brain OS sans les pages
     * des projets qu'elle ne voit pas.
     */
    @Transactional(readOnly = true)
    public Export export(String slug, Long userId) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found"));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), userId)) {
            throw new ResourceNotFoundException("Workspace not found");
        }
        Map<Long, ProjectBundleService.Export> exports = new LinkedHashMap<>();
        for (Project project : projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId())) {
            if (visibilityGuard.canView(project, userId)) {
                exports.put(project.getId(), projects.export(slug, project.getId(), userId));
            }
        }

        Map<String, Object> params = new HashMap<>();
        params.put("workspace", workspace.getId());
        // Liste jamais vide pour IN (...) : -1 n'est l'identifiant d'aucun projet.
        params.put("visible", exports.isEmpty() ? List.of(-1L) : new ArrayList<>(exports.keySet()));
        ObjectNode tables = JSON.createObjectNode();
        tables.set("workspaces", rows("SELECT row_to_json(t)::text FROM workspaces t WHERE id = :workspace", params, Set.of()));
        tables.set("brain_workspaces", rows(
            "SELECT row_to_json(t)::text FROM brain_workspaces t WHERE workspace_id = :workspace ORDER BY id", params, Set.of()));
        ArrayNode nodes = rows("SELECT row_to_json(n)::text FROM knowledge_nodes n WHERE n.workspace_id = :workspace AND ("
            + "n.ref_type IS NULL OR n.ref_type NOT IN ('PROJECT', 'ISSUE', 'CYCLE') "
            + "OR (n.ref_type = 'PROJECT' AND n.ref_id IN (:visible)) "
            + "OR (n.ref_type = 'ISSUE' AND n.ref_id IN (SELECT id FROM issues WHERE project_id IN (:visible))) "
            + "OR (n.ref_type = 'CYCLE' AND n.ref_id IN (SELECT id FROM cycles WHERE project_id IN (:visible)))) "
            + "ORDER BY n.id", params, Set.of("embedding", "embedding_model"));
        tables.set("knowledge_nodes", nodes);
        Set<Long> nodeIds = new HashSet<>();
        nodes.forEach(node -> nodeIds.add(node.path("id").asLong()));
        ArrayNode edges = JSON.createArrayNode();
        rows("SELECT row_to_json(t)::text FROM knowledge_edges t WHERE workspace_id = :workspace ORDER BY id", params, Set.of())
            .forEach(edge -> {
                if (nodeIds.contains(edge.path("from_node_id").asLong()) && nodeIds.contains(edge.path("to_node_id").asLong())) {
                    edges.add(edge);
                }
            });
        tables.set("knowledge_edges", edges);

        // Personnes citées par l'espace et son Brain OS (les projets portent les leurs) ; fichiers montrés par les pages.
        Set<Long> people = new TreeSet<>();
        addPerson(people, tables.path("workspaces").path(0).path("owner_id"));
        for (String table : List.of("brain_workspaces", "knowledge_nodes", "knowledge_edges")) {
            for (JsonNode row : tables.path(table)) {
                addPerson(people, row.path("created_by"));
                addPerson(people, row.path("updated_by"));
            }
        }
        Map<String, String> brainFiles = new LinkedHashMap<>();
        Pattern url = brainFileUrl(workspace.getId());
        for (JsonNode node : nodes) {
            for (String column : List.of("content", "content_url")) {
                Matcher matcher = url.matcher(node.path(column).asText(""));
                while (matcher.find()) {
                    brainFiles.putIfAbsent(matcher.group(1), contentType("brain/" + workspace.getId() + "/" + matcher.group(1)));
                }
            }
        }

        ObjectNode manifest = JSON.createObjectNode();
        manifest.put("format", FORMAT);
        manifest.put("version", VERSION);
        manifest.put("exportedAt", Instant.now().toString());
        manifest.put("schemaVersion", projects.schemaVersion());
        ArrayNode persons = manifest.putArray("people");
        userRepository.findAllById(people).forEach(user -> persons.addObject()
            .put("id", user.getId())
            .put("email", user.getEmail())
            .put("displayName", user.getDisplayName()));
        ArrayNode projectIds = manifest.putArray("projects");
        exports.keySet().forEach(projectIds::add);
        ArrayNode files = manifest.putArray("brainFiles");
        brainFiles.forEach((name, type) -> files.addObject().put("name", name).put("contentType", type));
        manifest.set("tables", tables);

        String fileName = workspace.getSlug() + "-" + LocalDate.now(ZoneOffset.UTC) + ".taskforce-workspace.zip";
        try {
            return new Export(fileName, JSON.writeValueAsBytes(manifest), exports, workspace.getId(), brainFiles.keySet());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Workspace file not written: " + e.getMessage(), e);
        }
    }

    /** Écrit le fichier : l'espace et son Brain OS, chaque projet, puis les fichiers des pages (un absent est sauté). */
    public void write(Export export, OutputStream out) throws IOException {
        ZipOutputStream zip = new ZipOutputStream(out);
        zip.putNextEntry(new ZipEntry(MANIFEST));
        zip.write(export.manifest());
        zip.closeEntry();
        for (Map.Entry<Long, ProjectBundleService.Export> project : export.projects().entrySet()) {
            projects.writeEntries(project.getValue(), zip, PROJECTS + project.getKey() + "/");
        }
        for (String name : export.brainFiles()) {
            InputStream in;
            try {
                in = objectStorage.getObjectStream("brain/" + export.workspaceId() + "/" + name);
            } catch (RuntimeException e) {
                log.warn("Fichier du Brain OS absent du stockage, laissé hors du fichier d'espace");
                continue;
            }
            try (in) {
                zip.putNextEntry(new ZipEntry(BRAIN_FILES + name));
                in.transferTo(zip);
                zip.closeEntry();
            }
        }
        zip.finish();
    }

    private ArrayNode rows(String sql, Map<String, Object> params, Set<String> dropped) {
        ArrayNode rows = JSON.createArrayNode();
        for (String json : jdbc.queryForList(sql, params, String.class)) {
            ObjectNode row = (ObjectNode) ProjectBundleService.parse(json.getBytes(StandardCharsets.UTF_8));
            dropped.forEach(row::remove);
            rows.add(row);
        }
        return rows;
    }

    private static void addPerson(Set<Long> people, JsonNode value) {
        if (value.isIntegralNumber()) {
            people.add(value.asLong());
        } else if (value.isTextual() && value.asText().matches("\\d{1,18}")) {
            people.add(Long.parseLong(value.asText()));
        }
    }

    private String contentType(String key) {
        try {
            String type = objectStorage.contentType(key);
            return type == null || type.isBlank() ? "application/octet-stream" : type;
        } catch (RuntimeException e) {
            return "application/octet-stream";
        }
    }

    /** Adresse d'un fichier du Brain OS de cet espace dans une page ({@code /api/files/brain/<espace>/<nom>}). */
    static Pattern brainFileUrl(Long workspaceId) {
        return Pattern.compile("/api/files/brain/" + workspaceId + "/([A-Za-z0-9._-]{1,255})");
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Import
    // ---------------------------------------------------------------------------------------------------------------

    /**
     * Crée, pour la personne, un nouvel espace à partir d'un fichier d'espace : elle en est propriétaire, et il reçoit
     * les projets et le Brain OS du fichier. Tout ou rien : un échec n'en laisse aucune trace, fichiers compris.
     *
     * @return le nouvel espace
     */
    @Transactional
    public Workspace importBundle(Long userId, Path file) {
        User importer = userRepository.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        try (ZipFile zip = new ZipFile(file.toFile())) {
            ProjectBundleService.checkEntryCount(zip);
            ObjectNode manifest = readManifest(zip);
            Workspace workspace = createWorkspace(importer, manifest.path("tables").path("workspaces").path(0));
            Map<String, Map<Long, Long>> ids = new HashMap<>();
            ids.put("workspaces", new HashMap<>(Map.of(
                manifest.path("tables").path("workspaces").path(0).path("id").asLong(), workspace.getId())));
            for (JsonNode projectId : manifest.path("projects")) {
                String prefix = PROJECTS + projectId.asLong() + "/";
                if (projectId.isIntegralNumber() && zip.getEntry(prefix + ProjectBundle.MANIFEST) != null) {
                    ProjectBundleService.Imported imported = projects.importProject(workspace, userId, zip, prefix);
                    imported.ids().forEach((table, map) -> ids.computeIfAbsent(table, t -> new HashMap<>()).putAll(map));
                }
            }
            new BrainImporter(workspace, importer, manifest, zip, ids).run();
            log.info("Espace {} importé par l'utilisateur {} ({} projet(s))", workspace.getId(), userId,
                ids.getOrDefault("projects", Map.of()).size());
            return workspace;
        } catch (ZipException e) {
            throw new BusinessException(NOT_A_BUNDLE);
        } catch (IOException e) {
            throw new BusinessException("This workspace file couldn't be read. Export it again, then try again.");
        } catch (DataAccessException e) {
            log.warn("Import d'espace refusé par la base : {}", e.getMostSpecificCause().getMessage());
            throw new BusinessException(ProjectBundleService.UNREADABLE_DATA);
        }
    }

    private static ObjectNode readManifest(ZipFile zip) throws IOException {
        ZipEntry entry = zip.getEntry(MANIFEST);
        if (entry == null) {
            throw new BusinessException(NOT_A_BUNDLE);
        }
        byte[] bytes;
        try (InputStream in = zip.getInputStream(entry)) {
            bytes = ProjectBundleService.readAtMost(in, ProjectBundleService.MAX_MANIFEST_BYTES);
        }
        JsonNode parsed;
        try {
            parsed = JSON.readTree(bytes);
        } catch (IOException e) {
            throw new BusinessException(NOT_A_BUNDLE);
        }
        if (!(parsed instanceof ObjectNode manifest) || !FORMAT.equals(manifest.path("format").asText())) {
            throw new BusinessException(NOT_A_BUNDLE);
        }
        if (manifest.path("version").asInt(0) > VERSION) {
            throw new BusinessException(NEWER_VERSION);
        }
        JsonNode workspaces = manifest.path("tables").path("workspaces");
        if (!workspaces.isArray() || workspaces.size() != 1 || !workspaces.get(0).isObject()) {
            throw new BusinessException(NOT_A_BUNDLE);
        }
        return manifest;
    }

    /** Le nouvel espace : nom, description et activité du fichier, adresse libre, la personne en propriétaire. */
    private Workspace createWorkspace(User importer, JsonNode row) {
        String name = truncate(row.path("name").asText("").strip(), 100);
        if (name.isEmpty()) {
            name = "Imported workspace";
        }
        String slug = workspaceService.uniqueSlug(name);
        if (slug.isBlank()) {
            slug = workspaceService.uniqueSlug("workspace");
        }
        Workspace workspace = workspaceRepository.save(Workspace.builder()
            .name(name)
            .slug(slug)
            .description(row.hasNonNull("description") ? truncate(row.get("description").asText(), 500) : null)
            .activity(row.hasNonNull("activity") ? truncate(row.get("activity").asText(), 500) : null)
            .owner(importer)
            .build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(workspace).user(importer)
            .role(WorkspaceRole.OWNER).build());
        return workspace;
    }

    private static String truncate(String value, int max) {
        return value.length() > max ? value.substring(0, max) : value;
    }

    /** Le Brain OS du fichier, recréé dans le nouvel espace. */
    private final class BrainImporter {

        private final Workspace workspace;
        private final User importer;
        private final ObjectNode manifest;
        private final ZipFile zip;
        private final Map<String, Map<Long, Long>> ids;
        private final Map<Long, Long> people = new HashMap<>();
        private final Map<Long, Long> nodes = new HashMap<>();
        private final Map<Long, Long> parents = new HashMap<>();
        private final List<String> uploaded = new ArrayList<>();
        private Long brainId;

        BrainImporter(Workspace workspace, User importer, ObjectNode manifest, ZipFile zip, Map<String, Map<Long, Long>> ids) {
            this.workspace = workspace;
            this.importer = importer;
            this.manifest = manifest;
            this.zip = zip;
            this.ids = ids;
        }

        void run() throws IOException {
            forgetUploadsOnRollback();
            for (JsonNode person : manifest.path("people")) {
                if (person.path("id").isIntegralNumber()) {
                    people.put(person.get("id").asLong(), importedPeople.resolve(text(person, "email"),
                        text(person, "displayName"), importer.getId(), workspace.getId()));
                }
            }
            Long oldWorkspaceId = manifest.path("tables").path("workspaces").path(0).path("id").asLong();
            storeFiles(oldWorkspaceId);
            brain();
            Pattern url = brainFileUrl(oldWorkspaceId);
            ProjectBundleService.Columns columns = projects.columns("knowledge_nodes");
            for (JsonNode node : manifest.path("tables").path("knowledge_nodes")) {
                if (node instanceof ObjectNode row) {
                    node(row.deepCopy(), columns, url);
                }
            }
            parents.forEach((child, parent) -> {
                Long newChild = nodes.get(child);
                Long newParent = nodes.get(parent);
                if (newChild != null && newParent != null) {
                    jdbc.update("UPDATE knowledge_nodes SET parent_node_id = :parent WHERE id = :id",
                        Map.of("parent", newParent, "id", newChild));
                }
            });
            ProjectBundleService.Columns edgeColumns = projects.columns("knowledge_edges");
            for (JsonNode edge : manifest.path("tables").path("knowledge_edges")) {
                if (edge instanceof ObjectNode row) {
                    edge(row.deepCopy(), edgeColumns);
                }
            }
        }

        /** Le Brain OS de l'espace (un par espace) ; le fichier peut n'en avoir aucun. */
        private void brain() {
            ObjectNode row = manifest.path("tables").path("brain_workspaces").path(0) instanceof ObjectNode found
                ? found.deepCopy() : JSON.createObjectNode();
            row.remove("id");
            row.put("workspace_id", workspace.getId());
            person(row, "created_by");
            person(row, "updated_by");
            brainId = projects.insertRow("brain_workspaces", projects.columns("brain_workspaces"), row, true, "");
        }

        private void node(ObjectNode row, ProjectBundleService.Columns columns, Pattern url) {
            Long oldId = row.path("id").isIntegralNumber() ? row.get("id").asLong() : null;
            NODE_LOCAL_COLUMNS.forEach(row::remove);
            row.put("uuid", UUID.randomUUID().toString());
            row.put("workspace_id", workspace.getId());
            if (brainId != null) {
                row.put("brain_id", brainId);
            } else {
                row.putNull("brain_id");
            }
            if (oldId != null && row.path("parent_node_id").isIntegralNumber()) {
                parents.put(oldId, row.get("parent_node_id").asLong());
            }
            row.putNull("parent_node_id");
            reference(row);
            person(row, "created_by");
            person(row, "updated_by");
            for (String column : List.of("content", "content_url")) {
                if (row.hasNonNull(column)) {
                    row.put(column, url.matcher(row.get(column).asText())
                        .replaceAll("/api/files/brain/" + workspace.getId() + "/$1"));
                }
            }
            if (row.path("metadata") instanceof ObjectNode metadata) {
                METADATA_REFS.forEach((key, table) -> {
                    if (metadata.has(key)) {
                        Long mapped = metadata.get(key).canConvertToLong()
                            ? ids.getOrDefault(table, Map.of()).get(metadata.get(key).asLong()) : null;
                        if (mapped == null) {
                            metadata.remove(key);
                        } else {
                            metadata.put(key, mapped);
                        }
                    }
                });
            }
            Long newId = projects.insertRow("knowledge_nodes", columns, row, true, "");
            if (oldId != null && newId != null) {
                nodes.put(oldId, newId);
            }
        }

        /** Projet, ticket, cycle ou espace que la page décrit ; une référence sans correspondance est retirée. */
        private void reference(ObjectNode row) {
            String type = row.path("ref_type").asText("");
            if (!row.path("ref_id").isIntegralNumber()) {
                return;
            }
            long cited = row.get("ref_id").asLong();
            Long mapped = "WORKSPACE".equals(type) ? workspace.getId()
                : NODE_REFS.containsKey(type) ? ids.getOrDefault(NODE_REFS.get(type), Map.of()).get(cited) : null;
            if (mapped == null) {
                row.putNull("ref_type");
                row.putNull("ref_id");
            } else {
                row.put("ref_id", mapped);
            }
        }

        private void edge(ObjectNode row, ProjectBundleService.Columns columns) {
            Long from = nodes.get(row.path("from_node_id").asLong());
            Long to = nodes.get(row.path("to_node_id").asLong());
            if (from == null || to == null) {
                return;
            }
            row.remove("id");
            row.put("workspace_id", workspace.getId());
            row.put("from_node_id", from);
            row.put("to_node_id", to);
            person(row, "created_by");
            projects.insertRow("knowledge_edges", columns, row, false, "ON CONFLICT DO NOTHING");
        }

        /** Auteur d'une ligne du Brain OS (identifiant écrit en texte) : sa correspondance, sinon la personne qui importe. */
        private void person(ObjectNode row, String column) {
            JsonNode value = row.path(column);
            if (value.isMissingNode() || value.isNull()) {
                return;
            }
            Long mapped = null;
            if (value.isIntegralNumber() || value.asText().matches("\\d{1,18}")) {
                mapped = people.get(value.asLong());
            }
            row.put(column, String.valueOf(mapped != null ? mapped : importer.getId()));
        }

        /** Les fichiers montrés par les pages, rangés dans le stockage du nouvel espace sous le même nom. */
        private void storeFiles(Long oldWorkspaceId) throws IOException {
            long unpacked = 0;
            for (JsonNode file : manifest.path("brainFiles")) {
                String name = text(file, "name");
                ZipEntry entry = name == null || !FILE_NAME.matcher(name).matches() ? null : zip.getEntry(BRAIN_FILES + name);
                if (entry == null) {
                    continue;
                }
                byte[] content;
                try (InputStream in = zip.getInputStream(entry)) {
                    content = ProjectBundleService.readAtMost(in, ProjectBundleService.MAX_FILE_BYTES);
                }
                unpacked += content.length;
                if (unpacked > ProjectBundleService.MAX_TOTAL_BYTES) {
                    throw new BusinessException(ProjectBundleService.TOO_LARGE);
                }
                String key = "brain/" + workspace.getId() + "/" + name;
                String type = text(file, "contentType");
                objectStorage.upload(key, new ByteArrayInputStream(content), content.length,
                    type == null || type.isBlank() ? "application/octet-stream" : type);
                uploaded.add(key);
            }
            log.debug("Fichiers du Brain OS de l'espace {} rangés pour l'espace {}", oldWorkspaceId, workspace.getId());
        }

        private void forgetUploadsOnRollback() {
            if (!TransactionSynchronizationManager.isSynchronizationActive()) {
                return;
            }
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status == STATUS_COMMITTED) {
                        return;
                    }
                    for (String key : uploaded) {
                        try {
                            objectStorage.delete(key);
                        } catch (RuntimeException e) {
                            log.warn("Fichier d'un import d'espace annulé non effacé du stockage : {}", e.getMessage());
                        }
                    }
                }
            });
        }

        private static String text(JsonNode node, String field) {
            return node.hasNonNull(field) ? node.get(field).asText() : null;
        }
    }
}
