package com.taskforce.tf_api.modules.storage.service;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.service.mcp.CompanyConnections;
import com.taskforce.tf_api.core.service.mcp.CompanyConnections.Usable;
import com.taskforce.tf_api.core.service.mcp.GoogleDriveApi;
import com.taskforce.tf_api.modules.storage.domain.StorageKind;
import com.taskforce.tf_api.modules.storage.domain.StorageTarget;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.RequiredArgsConstructor;

/**
 * Un dossier de Google Drive (R156), choisi dans le sélecteur de Google : avec la portée {@code drive.file}, TaskForce y
 * écrit parce que la personne l'a choisi, et ne voit rien d'autre de son Drive. Le document arrive par la connexion de
 * la personne, avec ses droits ; Drive garde un fichier du même nom à côté.
 */
@Component
@RequiredArgsConstructor
public class GoogleDriveDocumentWriter implements DocumentWriter {

    static final String TOOL = "Google Drive";

    private final CompanyStorageAccess access;
    private final CompanyConnections connections;
    private final GoogleDriveApi drive;

    @Override
    public StorageKind kind() {
        return StorageKind.GOOGLE_DRIVE;
    }

    @Override
    public String readiness(Long workspaceId, Long userId) {
        return access.readiness(workspaceId, userId, StorageKind.GOOGLE_DRIVE.connectorKey(), null);
    }

    @Override
    public StorageTarget check(Long workspaceId, Long userId, StorageTarget wanted) {
        if (wanted.getFolderId() == null) throw new BusinessException("Choose a folder in Google Drive.");
        Usable u = access.writer(workspaceId, userId, StorageKind.GOOGLE_DRIVE.connectorKey(), TOOL);
        GoogleDriveApi.DriveFile folder = connections.call(u, token -> drive.folder(u.base(), token, wanted.getFolderId()));
        return StorageTarget.builder().workspaceId(workspaceId).kind(StorageKind.GOOGLE_DRIVE)
            .connectorKey(StorageKind.GOOGLE_DRIVE.connectorKey()).folderId(folder.id()).folderName(folder.name())
            .folderUrl(folder.webViewLink()).build();
    }

    @Override
    public Written write(Long workspaceId, Long userId, StorageTarget target, DocumentFile file) {
        Usable u = access.writer(workspaceId, userId, StorageKind.GOOGLE_DRIVE.connectorKey(), TOOL);
        GoogleDriveApi.DriveFile saved = connections.call(u, token -> drive.upload(u.base(), token, target.getFolderId(),
            file.fileName(), file.mediaType(), file.content()));
        return new Written(saved.id(), null, saved.name(), saved.webViewLink(), saved.version());
    }
}
