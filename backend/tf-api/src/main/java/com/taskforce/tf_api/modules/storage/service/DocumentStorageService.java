package com.taskforce.tf_api.modules.storage.service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.CortexRecordService;
import com.taskforce.tf_api.modules.storage.domain.StorageTarget;
import com.taskforce.tf_api.modules.storage.domain.StoredDocument;
import com.taskforce.tf_api.modules.storage.repository.StoredDocumentRepository;
import com.taskforce.tf_api.modules.storage.service.DocumentWriter.DocumentFile;
import com.taskforce.tf_api.modules.storage.service.DocumentWriter.Written;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Range un document que TaskForce a écrit là où l'espace, ou son projet, l'a choisi (séance n°22, R156), puis dit où il
 * vit. Ce qui décide (les règles, l'accord de la personne) a eu lieu avant, chez l'appelant : Cortex passe par le moteur,
 * et le socle garde pour une personne la sortie d'un agent ({@link SaveDocumentTool}).
 *
 * <p>La sortie entre au dossier avant de partir, puis avec ce qu'elle a donné (R93 : la destination, le volume,
 * l'empreinte) ; sans dossier, rien ne part. Le document va à la cible que la carte a montrée, ou nulle part : si elle a
 * changé entre la proposition et l'accord, TaskForce refuse (le signal d'arrêt de R156, un document écrit hors de la
 * cible choisie).</p>
 */
@Service
@RequiredArgsConstructor
public class DocumentStorageService {

    static final int MAX_BYTES = 1_000_000;
    static final int MAX_TITLE = 200;
    static final String PLACE_CHANGED = "Where this workspace saves documents changed after Cortex proposed it. Nothing "
        + "was saved: ask Cortex again to save it in the new place.";
    static final String PLACE_UNKNOWN = "This approval doesn't say where the document goes. Nothing was saved: ask Cortex "
        + "again to save it.";

    private final StorageTargetService targets;
    private final StoredDocumentRepository documents;
    private final CortexRecordService records;
    private final ProjectRepository projects;
    private final ProjectVisibilityGuard visibility;

    /**
     * Ce qu'on range : le titre et le texte Markdown, le projet, l'endroit que la carte a montré ({@code place}, sans
     * lequel rien ne s'écrit) et qui l'a écrit ({@code via}).
     */
    public record SaveRequest(Long projectId, String title, String content, String place, String via) {}

    @Transactional
    public StoredDocument save(AgentContext ctx, SaveRequest req) {
        String title = title(req.title());
        if (req.content() == null || req.content().isBlank()) {
            throw new BusinessException("The document is empty, so nothing was saved.");
        }
        DocumentFile file = DocumentFile.markdown(title, req.content());
        if (file.content().length > MAX_BYTES) {
            throw new BusinessException("This document is over 1 MB: TaskForce saves shorter documents.");
        }
        Long projectId = project(ctx, req.projectId());
        StorageTarget target = targets.effective(ctx.workspaceId(), projectId).target();
        // L'accord vaut pour l'endroit que la carte a montré, et pour lui seul : sans cet endroit, rien ne s'écrit.
        if (req.place() == null || req.place().isBlank()) {
            throw new BusinessException(PLACE_UNKNOWN);
        }
        if (!req.place().equals(target.place())) {
            throw new BusinessException(PLACE_CHANGED);
        }
        DocumentWriter writer = targets.writer(target.getKind());

        UUID record = records.open(ctx, "Save " + title, Map.of("via", "storage", "storage", target.getKind().wire()));
        Map<String, Object> requested = new LinkedHashMap<>();
        requested.put("title", title);
        requested.put("storage", target.getKind().wire());
        if (target.getFolderName() != null) requested.put("folder", target.getFolderName());
        if (projectId != null) requested.put("projectId", projectId);
        requested.put("sizeBytes", file.content().length);
        requested.put("sha256", file.sha256());
        requested.put("via", req.via() == null ? "cortex" : req.via());
        if (records.append(record, "storage.requested", CortexRecordService.Actor.person(ctx.userId()), requested).isEmpty()) {
            throw new BusinessException("The record of this document is full, so it was not saved.");
        }

        Written written = writer.write(ctx.workspaceId(), ctx.userId(), target, file);

        Map<String, Object> done = new LinkedHashMap<>();
        done.put("fileName", written.fileName());
        done.put("location", written.location());
        if (written.webUrl() != null) done.put("link", written.webUrl());
        if (written.version() != null) done.put("version", written.version());
        records.append(record, "storage.written", CortexRecordService.Actor.SERVER, done);

        return documents.save(StoredDocument.builder()
            .workspaceId(ctx.workspaceId()).projectId(projectId).title(title).fileName(written.fileName())
            .mediaType(file.mediaType()).sizeBytes((long) file.content().length).sha256(file.sha256())
            .kind(target.getKind()).connectorKey(target.getKind().connectorKey()).location(written.location())
            .driveId(written.driveId()).folderName(target.getFolderName()).webUrl(written.webUrl())
            .version(written.version()).requestedBy(ctx.userId()).approvedBy(ctx.userId())
            .via(req.via() == null ? "cortex" : req.via()).recordId(record)
            .build());
    }

    /** Le projet du document : un projet de l'espace que la personne voit ; nul pour l'espace. */
    Long project(AgentContext ctx, Long projectId) {
        if (projectId == null) return null;
        return projects.findByIdAndWorkspaceId(projectId, ctx.workspaceId())
            .filter(p -> visibility.canView(p, ctx.userId()))
            .map(p -> p.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
    }

    private static String title(String raw) {
        String t = raw == null ? "" : raw.strip().replaceAll("\\s+", " ");
        if (t.isEmpty()) throw new BusinessException("Give the document a title.");
        return t.length() > MAX_TITLE ? t.substring(0, MAX_TITLE).strip() : t;
    }
}
