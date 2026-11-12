package com.taskforce.tf_api.modules.storage.service;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.mcp.CompanyConnections;
import com.taskforce.tf_api.core.service.mcp.CompanyConnections.Usable;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.RequiredArgsConstructor;

/**
 * Par quelle connexion on range chez l'entreprise (séance n°22, R154, R156) : celle de la personne pour qui le document
 * est rangé, sinon celle que l'espace partage, qu'un propriétaire ou un administrateur seul fait écrire (OSS-1.5) ;
 * jamais la connexion d'une autre personne.
 */
@Component
@RequiredArgsConstructor
public class CompanyStorageAccess {

    private final CompanyConnections connections;
    private final AuthorizationService authorization;

    /** Ce que la personne doit faire avant de ranger par cet outil. */
    public String readiness(Long workspaceId, Long userId, String connectorKey, String writeScope) {
        Optional<Usable> usable = connections.usable(workspaceId, userId, connectorKey);
        if (usable.isEmpty() || (usable.get().shared() && !authorization.isManager(workspaceId, userId))) {
            return StorageTargetService.CONNECT;
        }
        if (writeScope != null && !usable.get().grants(writeScope)) return StorageTargetService.ALLOW_CHANGES;
        return StorageTargetService.READY;
    }

    /** La connexion par laquelle cette personne écrit ; lève, avec ce qu'il faut faire, quand il n'y en a pas. */
    public Usable writer(Long workspaceId, Long userId, String connectorKey, String toolName) {
        Usable usable = connections.usable(workspaceId, userId, connectorKey)
            .orElseThrow(() -> new BusinessException("Connect " + toolName + " first, in Settings, Integrations: "
                + "TaskForce saves there with your own account."));
        if (usable.shared() && !authorization.isManager(workspaceId, userId)) {
            throw new BusinessException("Only workspace owners and admins save through a connection shared with the "
                + "workspace. Connect " + toolName + " with your own account to save there.");
        }
        return usable;
    }
}
