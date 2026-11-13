package com.taskforce.tf_api.modules.storage.service;

import java.util.List;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.service.mcp.CompanyConnections;
import com.taskforce.tf_api.core.service.mcp.CompanyConnections.Usable;
import com.taskforce.tf_api.core.service.mcp.MicrosoftGraphApi;
import com.taskforce.tf_api.modules.storage.domain.StorageKind;
import com.taskforce.tf_api.modules.storage.domain.StorageTarget;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.RequiredArgsConstructor;

/**
 * Un dossier de OneDrive ou d'une bibliothèque SharePoint (R156), par Microsoft Graph et la connexion « Microsoft 365 »
 * de la personne. Écrire demande que la connexion accorde l'écriture des fichiers (« Also let Cortex propose changes ») ;
 * un fichier du même nom reste, le document prend un nom libre ; sa version est celle que SharePoint montre.
 */
@Component
@RequiredArgsConstructor
public class OneDriveDocumentWriter implements DocumentWriter {

    static final String TOOL = "Microsoft 365";
    /** Les portées qui laissent écrire un fichier : dans ses fichiers, ou dans tout ce que la personne peut modifier. */
    static final List<String> WRITE_SCOPES = List.of("files.readwrite.all", "files.readwrite", "sites.readwrite.all");

    private final CompanyStorageAccess access;
    private final CompanyConnections connections;
    private final MicrosoftGraphApi graph;

    @Override
    public StorageKind kind() {
        return StorageKind.ONEDRIVE;
    }

    @Override
    public String readiness(Long workspaceId, Long userId) {
        String state = access.readiness(workspaceId, userId, StorageKind.ONEDRIVE.connectorKey(), null);
        if (!StorageTargetService.READY.equals(state)) return state;
        Usable u = access.writer(workspaceId, userId, StorageKind.ONEDRIVE.connectorKey(), TOOL);
        return writes(u) ? StorageTargetService.READY : StorageTargetService.ALLOW_CHANGES;
    }

    @Override
    public StorageTarget check(Long workspaceId, Long userId, StorageTarget wanted) {
        if (wanted.getDriveId() == null || wanted.getFolderId() == null) {
            throw new BusinessException("Choose a folder in OneDrive or SharePoint.");
        }
        Usable u = writer(workspaceId, userId);
        MicrosoftGraphApi.Item folder = connections.call(u, token -> graph.folder(u.base(), token, wanted.getDriveId(),
            wanted.getFolderId()));
        return StorageTarget.builder().workspaceId(workspaceId).kind(StorageKind.ONEDRIVE)
            .connectorKey(StorageKind.ONEDRIVE.connectorKey()).driveId(wanted.getDriveId()).folderId(folder.id())
            .folderName(folder.name()).folderUrl(folder.webUrl()).build();
    }

    @Override
    public Written write(Long workspaceId, Long userId, StorageTarget target, DocumentFile file) {
        Usable u = writer(workspaceId, userId);
        return connections.call(u, token -> {
            MicrosoftGraphApi.Item saved = graph.upload(u.base(), token, target.getDriveId(), target.getFolderId(),
                file.fileName(), file.mediaType(), file.content());
            return new Written(saved.id(), saved.driveId(), saved.name(), saved.webUrl(), graph.version(u.base(), token, saved));
        });
    }

    private Usable writer(Long workspaceId, Long userId) {
        Usable u = access.writer(workspaceId, userId, StorageKind.ONEDRIVE.connectorKey(), TOOL);
        if (!writes(u)) {
            throw new BusinessException("Reconnect Microsoft 365 and allow changes, so TaskForce can save there.");
        }
        return u;
    }

    private static boolean writes(Usable u) {
        return WRITE_SCOPES.stream().anyMatch(u::grants);
    }
}
