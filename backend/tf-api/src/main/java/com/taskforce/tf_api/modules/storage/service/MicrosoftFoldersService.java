package com.taskforce.tf_api.modules.storage.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.service.mcp.CompanyConnections;
import com.taskforce.tf_api.core.service.mcp.CompanyConnections.Usable;
import com.taskforce.tf_api.core.service.mcp.MicrosoftGraphApi;
import com.taskforce.tf_api.modules.storage.domain.StorageKind;

import lombok.RequiredArgsConstructor;

/**
 * Les dossiers de OneDrive et de SharePoint où la personne peut choisir de ranger (R156), lus par sa connexion
 * « Microsoft 365 » : d'abord son OneDrive et les bibliothèques des sites qu'elle suit, puis un dossier à la fois.
 * Microsoft ne rend que ce qu'elle peut lire.
 */
@Service
@RequiredArgsConstructor
public class MicrosoftFoldersService {

    private final CompanyStorageAccess access;
    private final CompanyConnections connections;
    private final MicrosoftGraphApi graph;

    public List<MicrosoftGraphApi.Place> folders(Long workspaceId, Long userId, String driveId, String itemId) {
        Usable u = access.writer(workspaceId, userId, StorageKind.ONEDRIVE.connectorKey(), OneDriveDocumentWriter.TOOL);
        if (driveId == null || driveId.isBlank() || itemId == null || itemId.isBlank()) {
            return connections.call(u, token -> graph.roots(u.base(), token));
        }
        return connections.call(u, token -> graph.folders(u.base(), token, driveId, itemId));
    }
}
