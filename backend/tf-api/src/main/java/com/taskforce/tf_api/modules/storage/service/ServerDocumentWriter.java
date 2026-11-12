package com.taskforce.tf_api.modules.storage.service;

import java.io.ByteArrayInputStream;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.modules.ged.service.ObjectStorage;
import com.taskforce.tf_api.modules.storage.domain.StorageKind;
import com.taskforce.tf_api.modules.storage.domain.StorageTarget;
import com.taskforce.tf_api.modules.storage.domain.StoredDocument;

import lombok.RequiredArgsConstructor;

/**
 * Le serveur de TaskForce, la cible par défaut : le stockage d'objets de l'instance (MinIO sur un serveur, le dossier de
 * données sur l'app desktop), sous {@code documents/<espace>/<identifiant>/<fichier>}. Le document ne sort pas de
 * TaskForce ; l'API le sert à qui peut le voir.
 */
@Component
@RequiredArgsConstructor
public class ServerDocumentWriter implements DocumentWriter {

    static final String PREFIX = "documents/";

    private final ObjectStorage storage;

    @Override
    public StorageKind kind() {
        return StorageKind.SERVER;
    }

    @Override
    public StorageTarget check(Long workspaceId, Long userId, StorageTarget wanted) {
        return StorageTarget.server(workspaceId);
    }

    @Override
    public Written write(Long workspaceId, Long userId, StorageTarget target, DocumentFile file) {
        String key = PREFIX + workspaceId + "/" + UUID.randomUUID() + "/" + file.fileName();
        storage.upload(key, new ByteArrayInputStream(file.content()), file.content().length, file.mediaType());
        return new Written(key, null, file.fileName(), null, null);
    }

    /** Un lien temporaire, qui s'ouvre sans jeton dans le navigateur. */
    @Override
    public String link(StoredDocument doc) {
        return storage.presignedGetUrl(doc.getLocation());
    }
}
