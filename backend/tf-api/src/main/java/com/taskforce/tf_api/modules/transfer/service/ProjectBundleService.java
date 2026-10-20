package com.taskforce.tf_api.modules.transfer.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
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
import com.taskforce.tf_api.core.event.ProjectCreatedEvent;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.modules.ged.service.ObjectStorage;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Export et import d'un projet entier dans un fichier de projet TaskForce ({@link ProjectBundle}) : c'est ainsi qu'un
 * projet passe de la webapp à l'app desktop et inversement, à la demande.
 *
 * <p>L'export lit les lignes du projet telles quelles ({@code row_to_json}). L'import les recrée par
 * {@code json_populate_record}, qui convertit chaque valeur dans le type de sa colonne (énumérations, dates, tableaux)
 * : les dates d'origine sont gardées, et rien ne passe par les services métier, donc ni notification, ni webhook, ni
 * entrée d'historique en plus. Le fichier n'est jamais cru sur parole : chaque identifiant est renuméroté, chaque clé
 * étrangère passe par la table de correspondance (une clé inconnue est laissée de côté), seules les colonnes qui
 * existent dans cette base sont écrites, et la taille de l'archive est bornée entrée par entrée.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectBundleService {

    /** Plus grand {@code project.json} lu. */
    static final long MAX_MANIFEST_BYTES = 128L * 1024 * 1024;

    /** Plus grande pièce jointe lue dans un fichier. */
    static final long MAX_FILE_BYTES = 100L * 1024 * 1024;

    /** Plus grand total décompressé (projet et pièces jointes). */
    static final long MAX_TOTAL_BYTES = 2L * 1024 * 1024 * 1024;

    /** Plus grand nombre d'entrées dans l'archive. */
    static final int MAX_ENTRIES = 50_000;

    public static final String NOT_A_BUNDLE = "This file isn't a TaskForce project file.";
    public static final String NEWER_VERSION =
        "This project file comes from a newer version of TaskForce. Update TaskForce, then import it again.";
    public static final String TOO_LARGE = "This project file is too large to import.";
    public static final String UNREADABLE_DATA = "This project couldn't be imported: it holds data that this version of "
        + "TaskForce can't read. Update TaskForce, then try again.";

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern EXTENSION = Pattern.compile("\\.[A-Za-z0-9]{1,10}$");

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final ProjectRepository projectRepository;
    private final ProjectVisibilityGuard visibilityGuard;
    private final ProjectService projectService;
    private final UserRepository userRepository;
    private final ObjectStorage objectStorage;
    private final ImportedPeople importedPeople;
    private final ApplicationEventPublisher events;

    /** Fichier prêt à écrire : nom proposé, JSON du projet, et pièces jointes à y joindre. */
    public record Export(String fileName, byte[] manifest, List<StoredFile> files) {
    }

    /** Pièce jointe à joindre : son identifiant dans le fichier, et sa clé dans le stockage. */
    public record StoredFile(long id, String key) {
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Export
    // ---------------------------------------------------------------------------------------------------------------

    /** Lit un projet que la personne voit (404 sinon), table par table, avec les personnes que ses lignes citent. */
    @Transactional(readOnly = true)
    public Export export(String slug, Long projectId, Long userId) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found"));
        Project project = projectRepository.findByIdAndWorkspaceId(projectId, workspace.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
        visibilityGuard.assertCanView(project, userId);

        ObjectNode tables = JSON.createObjectNode();
        Set<Long> people = new TreeSet<>();
        List<StoredFile> files = new ArrayList<>();
        Map<String, Object> params = Map.of("project", projectId);
        for (ProjectBundle.Table table : ProjectBundle.TABLES) {
            ArrayNode rows = tables.putArray(table.name());
            String sql = "SELECT row_to_json(t)::text FROM " + table.name() + " t WHERE " + table.scope()
                + " ORDER BY " + table.orderBy();
            for (String json : jdbc.queryForList(sql, params, String.class)) {
                ObjectNode row = (ObjectNode) parse(json.getBytes(StandardCharsets.UTF_8));
                rows.add(row);
                table.refs().forEach((column, target) -> {
                    if ("users".equals(target) && row.hasNonNull(column)) {
                        people.add(row.get(column).asLong());
                    }
                });
                if ("attachments".equals(table.name())) {
                    files.add(new StoredFile(row.path("id").asLong(), row.path("stored_key").asText()));
                }
            }
        }

        ObjectNode manifest = JSON.createObjectNode();
        manifest.put("format", ProjectBundle.FORMAT);
        manifest.put("version", ProjectBundle.VERSION);
        manifest.put("exportedAt", Instant.now().toString());
        manifest.put("schemaVersion", schemaVersion());
        ArrayNode persons = manifest.putArray("people");
        userRepository.findAllById(people).forEach(user -> persons.addObject()
            .put("id", user.getId())
            .put("email", user.getEmail())
            .put("displayName", user.getDisplayName()));
        manifest.set("tables", tables);

        String fileName = project.getIdentifier() + "-" + LocalDate.now(ZoneOffset.UTC) + ".taskforce.zip";
        try {
            return new Export(fileName, JSON.writeValueAsBytes(manifest), files);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Project file not written: " + e.getMessage(), e);
        }
    }

    /** Écrit le fichier : le JSON du projet, puis chaque pièce jointe lue dans le stockage (une absente est sautée). */
    public void write(Export export, OutputStream out) throws IOException {
        ZipOutputStream zip = new ZipOutputStream(out);
        writeEntries(export, zip, "");
        zip.finish();
    }

    /** Écrit le projet dans une archive, sous {@code prefix} : vide pour un fichier de projet, {@code projects/<id>/} dans un fichier d'espace. */
    public void writeEntries(Export export, ZipOutputStream zip, String prefix) throws IOException {
        zip.putNextEntry(new ZipEntry(prefix + ProjectBundle.MANIFEST));
        zip.write(export.manifest());
        zip.closeEntry();
        for (StoredFile file : export.files()) {
            InputStream in;
            try {
                in = objectStorage.getObjectStream(file.key());
            } catch (RuntimeException e) {
                log.warn("Pièce jointe {} absente du stockage, laissée hors du fichier de projet", file.id());
                continue;
            }
            try (in) {
                zip.putNextEntry(new ZipEntry(prefix + ProjectBundle.FILES + file.id()));
                in.transferTo(zip);
                zip.closeEntry();
            }
        }
    }

    public String schemaVersion() {
        List<String> versions = jdbc.getJdbcTemplate().queryForList(
            "SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1", String.class);
        return versions.isEmpty() ? null : versions.getFirst();
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Import
    // ---------------------------------------------------------------------------------------------------------------

    /**
     * Crée dans l'espace, pour un de ses membres, le projet d'un fichier de projet, avec ses tickets, leur historique
     * et leurs pièces jointes. Tout ou rien : un échec n'en laisse aucune trace, pièces jointes comprises.
     *
     * @return l'identifiant du nouveau projet
     */
    @Transactional
    public Long importBundle(String slug, Long userId, Path file) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found"));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), userId)) {
            throw new BusinessException("You're not a member of this workspace");
        }
        try (ZipFile zip = new ZipFile(file.toFile())) {
            checkEntryCount(zip);
            Long projectId = importProject(workspace, userId, zip, "").projectId();
            events.publishEvent(new ProjectCreatedEvent(slug, workspace.getId(), projectId, userId));
            log.info("Projet {} importé dans le workspace {} par l'utilisateur {}", projectId, workspace.getId(), userId);
            return projectId;
        } catch (ZipException e) {
            throw new BusinessException(NOT_A_BUNDLE);
        } catch (IOException e) {
            throw new BusinessException("This project file couldn't be read. Export it again, then try again.");
        } catch (DataAccessException e) {
            log.warn("Import de projet refusé par la base : {}", e.getMostSpecificCause().getMessage());
            throw new BusinessException(UNREADABLE_DATA);
        }
    }

    /** Projet importé : son identifiant, et la correspondance des identifiants du fichier avec ceux de cette base, par table. */
    public record Imported(Long projectId, Map<String, Map<Long, Long>> ids) {
    }

    /**
     * Recrée le projet rangé sous {@code prefix} dans l'archive (vide pour un fichier de projet), sans annoncer sa
     * création : un espace importé apporte lui-même la fiche de ses projets dans son Brain OS. À appeler dans une
     * transaction.
     */
    public Imported importProject(Workspace workspace, Long userId, ZipFile zip, String prefix) throws IOException {
        Map<Long, ZipEntry> attachments = fileEntries(zip, prefix);
        ObjectNode manifest = readManifest(zip, prefix);
        Importer importer = new Importer(workspace, userId, manifest, zip, attachments);
        Long projectId = importer.run();
        return new Imported(projectId, importer.ids);
    }

    /** Une archive de plus de {@link #MAX_ENTRIES} entrées est refusée avant toute lecture. */
    static void checkEntryCount(ZipFile zip) {
        if (zip.size() > MAX_ENTRIES) {
            throw new BusinessException(TOO_LARGE);
        }
    }

    /** Pièces jointes du projet rangé sous {@code prefix}, par identifiant ; rien n'est jamais écrit sur le disque. */
    private static Map<Long, ZipEntry> fileEntries(ZipFile zip, String prefix) {
        Pattern fileEntry = Pattern.compile(Pattern.quote(prefix + ProjectBundle.FILES) + "(\\d{1,18})");
        Map<Long, ZipEntry> files = new HashMap<>();
        Enumeration<? extends ZipEntry> entries = zip.entries();
        while (entries.hasMoreElements()) {
            ZipEntry entry = entries.nextElement();
            Matcher matcher = fileEntry.matcher(entry.getName());
            if (matcher.matches()) {
                files.put(Long.parseLong(matcher.group(1)), entry);
            }
        }
        return files;
    }

    private static ObjectNode readManifest(ZipFile zip, String prefix) throws IOException {
        ZipEntry entry = zip.getEntry(prefix + ProjectBundle.MANIFEST);
        if (entry == null) {
            throw new BusinessException(NOT_A_BUNDLE);
        }
        byte[] bytes;
        try (InputStream in = zip.getInputStream(entry)) {
            bytes = readAtMost(in, MAX_MANIFEST_BYTES);
        }
        if (!(parse(bytes) instanceof ObjectNode manifest)
                || !ProjectBundle.FORMAT.equals(manifest.path("format").asText())) {
            throw new BusinessException(NOT_A_BUNDLE);
        }
        if (manifest.path("version").asInt(0) > ProjectBundle.VERSION) {
            throw new BusinessException(NEWER_VERSION);
        }
        JsonNode projects = manifest.path("tables").path("projects");
        if (!projects.isArray() || projects.size() != 1 || !manifest.path("tables").path("issue_statuses").isArray()
                || manifest.path("tables").path("issue_statuses").isEmpty()) {
            throw new BusinessException(NOT_A_BUNDLE);
        }
        return manifest;
    }

    static JsonNode parse(byte[] json) {
        try {
            return JSON.readTree(json);
        } catch (IOException e) {
            throw new BusinessException(NOT_A_BUNDLE);
        }
    }

    /** Copie un fichier reçu, au plus {@code max} octets ; au-delà, il est refusé. */
    public static void copyAtMost(InputStream in, OutputStream out, long max) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        for (int read = in.read(buffer); read != -1; read = in.read(buffer)) {
            total += read;
            if (total > max) {
                throw new BusinessException(TOO_LARGE);
            }
            out.write(buffer, 0, read);
        }
    }

    /** Lit au plus {@code max} octets ; au-delà, le fichier est refusé (archive qui se décompresse à l'infini). */
    static byte[] readAtMost(InputStream in, long max) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        for (int read = in.read(buffer); read != -1; read = in.read(buffer)) {
            total += read;
            if (total > max) {
                throw new BusinessException(TOO_LARGE);
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    /** Colonnes d'une table dans cette base : leurs noms, celles qui sont obligatoires, et ses clés étrangères. */
    public record Columns(Set<String> names, Set<String> required, Set<String> foreignKeys) {
    }

    public Columns columns(String table) {
        Map<String, Object> params = Map.of("table", table);
        Set<String> names = new HashSet<>();
        Set<String> required = new HashSet<>();
        jdbc.query("SELECT column_name, is_nullable FROM information_schema.columns "
                + "WHERE table_schema = current_schema() AND table_name = :table", params, rs -> {
                names.add(rs.getString("column_name"));
                if ("NO".equals(rs.getString("is_nullable"))) {
                    required.add(rs.getString("column_name"));
                }
            });
        Set<String> foreignKeys = new HashSet<>(jdbc.queryForList("SELECT kcu.column_name "
            + "FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu "
            + "ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema "
            + "AND kcu.table_name = tc.table_name "
            + "WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = current_schema() AND tc.table_name = :table",
            params, String.class));
        return new Columns(names, required, foreignKeys);
    }

    /**
     * Recrée une ligne du fichier par {@code json_populate_record}, qui convertit chaque valeur dans le type de sa
     * colonne. Seules les colonnes qui existent dans cette base sont écrites (aucun nom ne vient du fichier tel quel).
     *
     * @param table      table, d'une liste fixe
     * @param returnId   rendre l'identifiant de la ligne créée
     * @param onConflict suite de l'INSERT (« ON CONFLICT DO NOTHING ») ou vide
     * @return l'identifiant, ou {@code null} (pas d'identifiant demandé, ligne vide, ou ignorée sur conflit)
     */
    public Long insertRow(String table, Columns columns, ObjectNode row, boolean returnId, String onConflict) {
        List<String> names = new ArrayList<>();
        row.fieldNames().forEachRemaining(name -> {
            if (columns.names().contains(name)) {
                names.add(name);
            }
        });
        if (names.isEmpty()) {
            return null;
        }
        String list = names.stream().map(name -> '"' + name + '"').collect(Collectors.joining(", "));
        String sql = "INSERT INTO " + table + " (" + list + ") SELECT " + list
            + " FROM json_populate_record(NULL::" + table + ", CAST(:row AS json))" + (onConflict.isEmpty() ? "" : " " + onConflict);
        MapSqlParameterSource params = new MapSqlParameterSource("row", row.toString());
        if (!returnId) {
            jdbc.update(sql, params);
            return null;
        }
        List<Long> created = jdbc.queryForList(sql + " RETURNING id", params, Long.class);
        return created.isEmpty() ? null : created.getFirst();
    }

    /** Un import en cours : la correspondance des identifiants du fichier avec ceux de cette base. */
    private final class Importer {

        private final Workspace workspace;
        private final Long importerId;
        private final ObjectNode manifest;
        private final ZipFile zip;
        private final Map<Long, ZipEntry> files;
        private final Map<Long, Long> people = new HashMap<>();
        private final Map<String, Map<Long, Long>> ids = new HashMap<>();
        /** Ticket parent de chaque ticket (identifiants du fichier), relié une fois tous les tickets créés. */
        private final Map<Long, Long> parents = new HashMap<>();
        private final List<String> uploaded = new ArrayList<>();
        private long unpacked;
        private Long projectId;

        Importer(Workspace workspace, Long importerId, ObjectNode manifest, ZipFile zip, Map<Long, ZipEntry> files) {
            this.workspace = workspace;
            this.importerId = importerId;
            this.manifest = manifest;
            this.zip = zip;
            this.files = files;
        }

        Long run() throws IOException {
            forgetUploadsOnRollback();
            for (JsonNode person : manifest.path("people")) {
                if (person.path("id").isIntegralNumber()) {
                    people.put(person.get("id").asLong(), importedPeople.resolve(text(person, "email"),
                        text(person, "displayName"), importerId, workspace.getId()));
                }
            }
            for (ProjectBundle.Table table : ProjectBundle.TABLES) {
                Columns columns = columns(table.name());
                for (JsonNode row : manifest.path("tables").path(table.name())) {
                    if (row instanceof ObjectNode values) {
                        insert(table, columns, values.deepCopy());
                    }
                }
                if ("issue_statuses".equals(table.name()) && ids.getOrDefault(table.name(), Map.of()).isEmpty()) {
                    throw new BusinessException(NOT_A_BUNDLE);
                }
            }
            if (projectId == null) {
                throw new BusinessException(NOT_A_BUNDLE);
            }
            linkParents();
            finish();
            return projectId;
        }

        private void insert(ProjectBundle.Table table, Columns columns, ObjectNode row) throws IOException {
            Long oldId = row.path("id").isIntegralNumber() ? row.get("id").asLong() : null;
            row.remove("id");
            for (Map.Entry<String, String> ref : table.refs().entrySet()) {
                String column = ref.getKey();
                if (!row.hasNonNull(column)) {
                    continue;
                }
                long cited = row.get(column).asLong();
                if ("issues".equals(table.name()) && "parent_id".equals(column)) {
                    if (oldId != null) {
                        parents.put(oldId, cited);
                    }
                    row.putNull(column);
                    continue;
                }
                Long mapped = map(ref.getValue(), cited);
                if (mapped == null && columns.required().contains(column)) {
                    return; // la ligne cite ce qui n'est pas venu avec le projet : elle reste de côté
                }
                if (mapped == null) {
                    row.putNull(column);
                } else {
                    row.put(column, mapped);
                }
            }
            // Une clé étrangère que ce format ne connaît pas (version plus récente) prend sa valeur par défaut.
            columns.foreignKeys().stream().filter(column -> !table.refs().containsKey(column)).forEach(row::remove);

            if ("projects".equals(table.name())) {
                row.put("workspace_id", workspace.getId());
                row.put("identifier", identifier(row.path("identifier").asText("")));
            } else if ("attachments".equals(table.name()) && !storeAttachment(row, oldId)) {
                return;
            }

            Long newId = write(table, columns, row);
            if (oldId != null && newId != null) {
                ids.computeIfAbsent(table.name(), name -> new HashMap<>()).put(oldId, newId);
            }
            if ("projects".equals(table.name())) {
                projectId = newId;
            }
        }

        private Long map(String target, long cited) {
            return switch (target) {
                case "users" -> people.getOrDefault(cited, importerId);
                case "workspaces" -> workspace.getId();
                default -> ids.getOrDefault(target, Map.of()).get(cited);
            };
        }

        private Long write(ProjectBundle.Table table, Columns columns, ObjectNode row) {
            return insertRow(table.name(), columns, row, table.hasId(), "");
        }

        /** Identifiant du projet dans l'espace : celui du fichier, rendu unique (ACME → ACME2). */
        private String identifier(String fromFile) {
            String base = fromFile.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9-]", "").replaceAll("^-+", "");
            if (base.length() > 10) {
                base = base.substring(0, 10);
            }
            return projectService.uniqueIdentifier(workspace.getId(), base.length() < 2 ? "PRJ" : base);
        }

        /** Range le contenu d'une pièce jointe sous une nouvelle clé ; sans contenu dans le fichier, elle reste de côté. */
        private boolean storeAttachment(ObjectNode row, Long oldId) throws IOException {
            ZipEntry entry = oldId == null ? null : files.get(oldId);
            if (entry == null || !row.hasNonNull("issue_id")) {
                return false;
            }
            byte[] content;
            try (InputStream in = zip.getInputStream(entry)) {
                content = readAtMost(in, MAX_FILE_BYTES);
            }
            unpacked += content.length;
            if (unpacked > MAX_TOTAL_BYTES) {
                throw new BusinessException(TOO_LARGE);
            }
            String oldKey = row.path("stored_key").asText("");
            Matcher extension = EXTENSION.matcher(oldKey.substring(oldKey.lastIndexOf('/') + 1));
            String key = "issues/" + row.get("issue_id").asLong() + "/" + UUID.randomUUID()
                + (extension.find() ? extension.group() : "");
            String contentType = row.hasNonNull("content_type") ? row.get("content_type").asText()
                : "application/octet-stream";
            objectStorage.upload(key, new ByteArrayInputStream(content), content.length, contentType);
            uploaded.add(key);
            row.put("stored_key", key);
            row.put("file_size", content.length);
            return true;
        }

        private void linkParents() {
            Map<Long, Long> issues = ids.getOrDefault("issues", Map.of());
            parents.forEach((child, parent) -> {
                Long newChild = issues.get(child);
                Long newParent = issues.get(parent);
                if (newChild != null && newParent != null) {
                    jdbc.update("UPDATE issues SET parent_id = :parent WHERE id = :id",
                        Map.of("parent", newParent, "id", newChild));
                }
            });
        }

        /**
         * Numérotation des prochains tickets après le plus grand numéro importé ; la personne qui importe mène le
         * projet, et les autres personnes citées qui sont membres de l'espace en font partie.
         */
        private void finish() {
            Map<String, Object> project = Map.of("project", projectId);
            jdbc.update("INSERT INTO issue_sequence_counters (project_id, last_number) VALUES (:project, "
                + "(SELECT COALESCE(MAX(sequence_number), 0) FROM issues WHERE project_id = :project)) "
                + "ON CONFLICT (project_id) DO UPDATE SET last_number = EXCLUDED.last_number", project);
            addMember(importerId, "LEAD");
            new HashSet<>(people.values()).stream()
                .filter(person -> !person.equals(importerId))
                .filter(person -> workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), person))
                .forEach(person -> addMember(person, "MEMBER"));
        }

        private void addMember(Long userId, String role) {
            jdbc.update("INSERT INTO project_members (project_id, user_id, role, added_by) "
                    + "VALUES (:project, :user, CAST(:role AS project_role), :importer) ON CONFLICT DO NOTHING",
                Map.of("project", projectId, "user", userId, "role", role, "importer", importerId));
        }

        /** Un import annulé efface les pièces jointes déjà rangées : le stockage ne garde rien d'un projet absent. */
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
                            log.warn("Pièce jointe d'un import annulé non effacée du stockage : {}", e.getMessage());
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
