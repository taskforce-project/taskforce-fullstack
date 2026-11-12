package com.taskforce.tf_api.modules.storage.domain;

import java.util.UUID;

import com.taskforce.tf_api.shared.audit.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Un document que TaskForce a rangé, et où il vit (séance n°22, R156 : « le dossier dit où vit chaque document ») : la
 * cible, l'emplacement (la clé d'objet sur le serveur, le chemin sur la machine, l'identifiant chez l'éditeur), son lien,
 * sa version chez l'éditeur, son empreinte et sa taille ; pour qui il a été écrit, qui a accordé la sortie, et le dossier
 * de cette sortie (R93).
 */
@Entity
@Table(name = "stored_documents")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StoredDocument extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id", nullable = false)
    private Long workspaceId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName;

    @Column(name = "media_type", nullable = false, length = 127)
    private String mediaType;

    @Column(name = "size_bytes", nullable = false)
    private Long sizeBytes;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private StorageKind kind;

    @Column(name = "connector_key", length = 64)
    private String connectorKey;

    /** La clé d'objet, le chemin du fichier, ou l'identifiant du fichier chez l'éditeur. */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String location;

    @Column(name = "drive_id", length = 255)
    private String driveId;

    @Column(name = "folder_name", length = 255)
    private String folderName;

    /** Le lien chez l'éditeur ; nul sur le serveur (la route de l'API le sert) et sur la machine. */
    @Column(name = "web_url", columnDefinition = "TEXT")
    private String webUrl;

    /** La version que l'éditeur donne au fichier ; nulle quand il n'en donne pas. */
    @Column(length = 255)
    private String version;

    /** La personne pour qui le document a été écrit. */
    @Column(name = "requested_by")
    private Long requestedBy;

    /** La personne qui a accordé la sortie. */
    @Column(name = "approved_by")
    private Long approvedBy;

    /** Qui l'a écrit : {@code cortex} aujourd'hui, une mission demain. */
    @Column(nullable = false, length = 24)
    private String via;

    /** Le dossier de la sortie (R93). */
    @Column(name = "record_id")
    private UUID recordId;
}
