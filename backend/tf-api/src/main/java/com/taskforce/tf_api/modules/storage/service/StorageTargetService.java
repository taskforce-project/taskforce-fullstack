package com.taskforce.tf_api.modules.storage.service;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuditService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.modules.storage.domain.StorageKind;
import com.taskforce.tf_api.modules.storage.domain.StorageTarget;
import com.taskforce.tf_api.modules.storage.domain.StoredDocument;
import com.taskforce.tf_api.modules.storage.repository.StorageTargetRepository;
import com.taskforce.tf_api.modules.storage.repository.StoredDocumentRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Où TaskForce range ce qu'il écrit (séance n°22, R156) : chaque espace choisit, et chaque projet peut choisir le sien.
 * Un document va à la cible de son projet, sinon à celle de l'espace, sinon au serveur de TaskForce.
 *
 * <p>Les propriétaires et administrateurs choisissent pour l'espace ; eux et le responsable d'un projet, pour ce projet.
 * Chaque membre voit la cible, et si lui peut y ranger : le stockage de l'entreprise s'écrit par sa propre connexion.
 * Un document se voit avec son projet ; sans projet, par les propriétaires, les administrateurs et la personne pour qui
 * il a été écrit.</p>
 */
@Service
@RequiredArgsConstructor
public class StorageTargetService {

    /** Ce qu'une personne doit faire avant de ranger dans une cible : rien, s'y connecter, ou y accorder l'écriture. */
    public static final String READY = "ready";
    public static final String CONNECT = "connect";
    public static final String ALLOW_CHANGES = "allow-changes";

    private final StorageTargetRepository targets;
    private final StoredDocumentRepository documents;
    private final WorkspaceRepository workspaces;
    private final ProjectRepository projects;
    private final ProjectMemberRepository projectMembers;
    private final ProjectVisibilityGuard visibility;
    private final AuthorizationService authorization;
    private final UserRepository users;
    private final List<DocumentWriter> writers;
    private final AuditService audit;

    /** La cible qui vaut, et d'où elle vient : {@code project}, {@code workspace} ou {@code default}. */
    public record Resolved(StorageTarget target, String from) {}

    /** Ce que la personne choisit. */
    public record TargetRequest(String storage, String folderId, String driveId, String path) {}

    /**
     * Une cible, telle que l'écran la montre ; le dossier et le lecteur chez l'éditeur ne s'y lisent pas, ils servent à
     * garder le dossier quand la personne rouvre le choix.
     */
    public record TargetView(String storage, String folderId, String driveId, String folderName, String folderUrl,
                             String path, String from, String chosenBy) {}

    /** Une cible que la personne peut choisir, et ce qu'elle doit faire avant d'y ranger. */
    public record Choice(String storage, String state) {}

    /** Un document rangé, tel que l'écran le montre. */
    public record DocumentView(Long id, String title, String fileName, String storage, String folderName,
                               String webUrl, String version, long sizeBytes, String savedAt, Long projectId,
                               String savedFor, String approvedBy) {}

    /** L'écran « Storage » de l'espace, ou d'un projet. */
    public record Overview(String scope, TargetView target, TargetView inherited, boolean canEdit,
                           List<Choice> choices, List<DocumentView> documents) {}

    /** La cible d'un document de ce projet (nul : de l'espace). */
    @Transactional(readOnly = true)
    public Resolved effective(Long workspaceId, Long projectId) {
        if (projectId != null) {
            Optional<StorageTarget> own = targets.findByWorkspaceIdAndProjectId(workspaceId, projectId);
            if (own.isPresent()) return new Resolved(own.get(), "project");
        }
        return targets.findByWorkspaceIdAndProjectIdIsNull(workspaceId)
            .map(t -> new Resolved(t, "workspace"))
            .orElseGet(() -> new Resolved(StorageTarget.server(workspaceId), "default"));
    }

    @Transactional(readOnly = true)
    public Overview overview(String slug, Long userId, Long projectId) {
        Workspace ws = member(slug, userId);
        Project project = projectId == null ? null : visibleProject(ws, projectId, userId);
        boolean canEdit = project == null ? authorization.isManager(ws.getId(), userId) : canEditProject(ws, project, userId);
        Resolved resolved = effective(ws.getId(), projectId);
        TargetView inherited = null;
        if (project != null) {
            Resolved workspace = effective(ws.getId(), null);
            inherited = view(workspace.target(), workspace.from());
        }
        TargetView target = view(resolved.target(), project != null && !"project".equals(resolved.from()) ? "workspace"
            : resolved.from());
        List<Choice> choices = new ArrayList<>();
        for (DocumentWriter w : ordered()) {
            if (!w.offered()) continue;
            choices.add(new Choice(w.kind().wire(), w.readiness(ws.getId(), userId)));
        }
        return new Overview(project == null ? "workspace" : "project", target, inherited, canEdit, choices,
            documentsFor(ws, userId, projectId));
    }

    /** Choisit la cible de l'espace ({@code projectId} nul) ou d'un projet, après l'avoir vérifiée chez l'éditeur. */
    @Transactional
    public Overview choose(String slug, Long userId, Long projectId, TargetRequest request) {
        Workspace ws = member(slug, userId);
        Project project = projectId == null ? null : visibleProject(ws, projectId, userId);
        requireEdit(ws, project, userId);
        if (request == null || request.storage() == null) throw new BusinessException("Choose where to save documents");
        StorageKind kind = StorageKind.of(request.storage());
        DocumentWriter writer = writer(kind);
        if (!writer.offered()) throw new BusinessException("This place can't be chosen here.");
        StorageTarget wanted = StorageTarget.builder().workspaceId(ws.getId()).kind(kind)
            .connectorKey(kind.connectorKey()).folderId(blank(request.folderId())).driveId(blank(request.driveId()))
            .localPath(blank(request.path())).build();
        StorageTarget checked = writer.check(ws.getId(), userId, wanted);
        StorageTarget row = (projectId == null ? targets.findByWorkspaceIdAndProjectIdIsNull(ws.getId())
            : targets.findByWorkspaceIdAndProjectId(ws.getId(), projectId))
            .orElseGet(() -> StorageTarget.builder().workspaceId(ws.getId()).projectId(projectId).build());
        row.setKind(kind);
        row.setConnectorKey(kind.connectorKey());
        row.setDriveId(checked.getDriveId());
        row.setFolderId(checked.getFolderId());
        row.setFolderName(checked.getFolderName());
        row.setFolderUrl(checked.getFolderUrl());
        row.setLocalPath(checked.getLocalPath());
        row.setChosenBy(userId);
        targets.save(row);
        Map<String, Object> details = changeDetails("chosen", projectId);
        details.put("storage", kind.wire());
        if (row.getConnectorKey() != null) details.put("connectorKey", row.getConnectorKey());
        if (row.getFolderName() != null) details.put("folderName", row.getFolderName());
        record(ws, userId, projectId, details);
        return overview(slug, userId, projectId);
    }

    /** Revient au choix du dessus : celui de l'espace pour un projet, le serveur de TaskForce pour l'espace. */
    @Transactional
    public Overview reset(String slug, Long userId, Long projectId) {
        Workspace ws = member(slug, userId);
        Project project = projectId == null ? null : visibleProject(ws, projectId, userId);
        requireEdit(ws, project, userId);
        Optional<StorageTarget> chosen = projectId == null ? targets.findByWorkspaceIdAndProjectIdIsNull(ws.getId())
            : targets.findByWorkspaceIdAndProjectId(ws.getId(), projectId);
        chosen.ifPresent(row -> {
            targets.delete(row);
            Map<String, Object> details = changeDetails("reset", projectId);
            details.put("previous", row.getKind().wire());
            record(ws, userId, projectId, details);
        });
        return overview(slug, userId, projectId);
    }

    /** Un document rangé, s'il est de cet espace et que la personne peut le voir ({@link #canSee}). */
    @Transactional(readOnly = true)
    public StoredDocument document(String slug, Long userId, Long documentId) {
        Workspace ws = member(slug, userId);
        StoredDocument doc = documents.findByIdAndWorkspaceId(documentId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (doc.getProjectId() != null) {
            projects.findByIdAndWorkspaceId(doc.getProjectId(), ws.getId())
                .filter(p -> visibility.canView(p, userId))
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        } else if (!canSee(doc, userId, authorization.isManager(ws.getId(), userId))) {
            throw new ResourceNotFoundException("Document not found");
        }
        return doc;
    }

    /**
     * Un document sans projet (rangé hors d'un projet, ou dont le projet a été supprimé : la ligne reste, son projet
     * devient nul, V127) ne se montre qu'aux propriétaires et administrateurs de l'espace, et à la personne pour qui il a
     * été écrit ; jamais à tout membre.
     */
    private static boolean canSee(StoredDocument doc, Long userId, boolean manager) {
        return manager || (userId != null && userId.equals(doc.getRequestedBy()));
    }

    /** L'espace de ce slug, si la personne en est membre. */
    @Transactional(readOnly = true)
    public Long workspaceId(String slug, Long userId) {
        return member(slug, userId).getId();
    }

    /** L'écrivain d'une cible. */
    public DocumentWriter writer(StorageKind kind) {
        for (DocumentWriter w : writers) if (w.kind() == kind) return w;
        throw new BusinessException("This place can't be written to yet.");
    }

    // -------------------------------------------------------------------------

    private List<DocumentView> documentsFor(Workspace ws, Long userId, Long projectId) {
        List<StoredDocument> rows = projectId == null
            ? documents.findTop100ByWorkspaceIdOrderByCreatedAtDesc(ws.getId())
            : documents.findTop50ByWorkspaceIdAndProjectIdOrderByCreatedAtDesc(ws.getId(), projectId);
        Set<Long> viewable = new HashSet<>(visibility.viewableProjectIds(ws.getId(), userId));
        boolean manager = authorization.isManager(ws.getId(), userId);
        Map<Long, String> names = new HashMap<>();
        List<DocumentView> out = new ArrayList<>();
        for (StoredDocument d : rows) {
            if (d.getProjectId() != null ? !viewable.contains(d.getProjectId()) : !canSee(d, userId, manager)) continue;
            out.add(new DocumentView(d.getId(), d.getTitle(), d.getFileName(), d.getKind().wire(), d.getFolderName(),
                d.getWebUrl(), d.getVersion(), d.getSizeBytes() == null ? 0 : d.getSizeBytes(),
                d.getCreatedAt() == null ? null : d.getCreatedAt().toString(), d.getProjectId(),
                name(d.getRequestedBy(), names), name(d.getApprovedBy(), names)));
        }
        return out;
    }

    private TargetView view(StorageTarget t, String from) {
        return new TargetView(t.getKind().wire(), t.getFolderId(), t.getDriveId(), t.getFolderName(), t.getFolderUrl(),
            t.getLocalPath(), from,
            t.getChosenBy() == null ? null : name(t.getChosenBy(), new HashMap<>()));
    }

    private String name(Long userId, Map<Long, String> cache) {
        if (userId == null) return null;
        return cache.computeIfAbsent(userId, id -> users.findById(id).map(StorageTargetService::nameOf).orElse(null));
    }

    private static String nameOf(User u) {
        return u.getDisplayName() != null && !u.getDisplayName().isBlank() ? u.getDisplayName() : u.getEmail();
    }

    /** Les cibles dans l'ordre de l'écran : le serveur, la machine, puis le stockage de l'entreprise. */
    private List<DocumentWriter> ordered() {
        Map<StorageKind, DocumentWriter> byKind = new EnumMap<>(StorageKind.class);
        for (DocumentWriter w : writers) byKind.put(w.kind(), w);
        return new ArrayList<>(byKind.values());
    }

    private Workspace member(String slug, Long userId) {
        Workspace ws = workspaces.findBySlug(slug).orElseThrow(() -> new ResourceNotFoundException("Workspace", "slug", slug));
        authorization.requireMember(ws.getId(), userId);
        return ws;
    }

    private Project visibleProject(Workspace ws, Long projectId, Long userId) {
        return projects.findByIdAndWorkspaceId(projectId, ws.getId())
            .filter(p -> visibility.canView(p, userId))
            .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
    }

    private boolean canEditProject(Workspace ws, Project project, Long userId) {
        if (authorization.isManager(ws.getId(), userId)) return true;
        return projectMembers.findByProjectIdAndUserId(project.getId(), userId)
            .map(pm -> pm.getRole() == ProjectRole.LEAD).orElse(false);
    }

    private void requireEdit(Workspace ws, Project project, Long userId) {
        boolean allowed = project == null ? authorization.isManager(ws.getId(), userId) : canEditProject(ws, project, userId);
        if (!allowed) {
            throw new ForbiddenException(project == null
                ? "Only workspace owners and admins choose where the workspace saves documents."
                : "Only the project's lead, owners and admins choose where this project saves documents.");
        }
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    /** Le début du détail d'un choix : ce qui a changé, et pour quoi (l'espace, ou un projet). */
    private static Map<String, Object> changeDetails(String change, Long projectId) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("change", change);
        details.put("scope", projectId == null ? "workspace" : "project");
        if (projectId != null) details.put("projectId", projectId);
        return details;
    }

    /**
     * L'endroit choisi entre au journal de l'espace (séance n°23, R160) : la cible, le connecteur et le nom du dossier,
     * jamais le chemin d'un dossier de la machine ni un identifiant chez l'éditeur.
     */
    private void record(Workspace ws, Long userId, Long projectId, Map<String, Object> details) {
        audit.record(ws.getId(), userId, AuditService.STORAGE_TARGET_CHANGED, "storage_target",
            projectId == null ? null : String.valueOf(projectId), details);
    }
}
