package com.taskforce.tf_api.modules.storage.domain;

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
 * Où TaskForce range ce qu'il écrit, pour un espace ({@code projectId} nul) ou pour un projet qui choisit le sien
 * (séance n°22, R156). Sans ligne, c'est le serveur de TaskForce.
 *
 * <p>Pour le stockage de l'entreprise, la cible désigne un dossier chez l'éditeur ({@code folderId}, et le lecteur
 * {@code driveId} chez Microsoft) ; elle ne garde aucune connexion : on écrit toujours par celle de la personne pour qui
 * le document est rangé, avec ses droits.</p>
 */
@Entity
@Table(name = "storage_targets")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StorageTarget extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id", nullable = false)
    private Long workspaceId;

    /** Le projet qui a choisi sa cible ; nul pour celle de l'espace. */
    @Column(name = "project_id")
    private Long projectId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private StorageKind kind;

    @Column(name = "connector_key", length = 64)
    private String connectorKey;

    /** Le lecteur chez Microsoft (OneDrive de la personne, bibliothèque SharePoint). */
    @Column(name = "drive_id", length = 255)
    private String driveId;

    @Column(name = "folder_id", length = 512)
    private String folderId;

    /** Le nom du dossier, tel que l'éditeur le donne au moment du choix. */
    @Column(name = "folder_name", length = 255)
    private String folderName;

    @Column(name = "folder_url", columnDefinition = "TEXT")
    private String folderUrl;

    /** Le dossier choisi sur la machine (app desktop). */
    @Column(name = "local_path", columnDefinition = "TEXT")
    private String localPath;

    @Column(name = "chosen_by")
    private Long chosenBy;

    /** Le serveur de TaskForce, quand rien n'est choisi. */
    public static StorageTarget server(Long workspaceId) {
        return StorageTarget.builder().workspaceId(workspaceId).kind(StorageKind.SERVER).build();
    }

    /** Ce qui désigne l'endroit, pour vérifier qu'il n'a pas changé entre la carte et l'accord. */
    public String place() {
        return switch (kind) {
            case SERVER -> "server";
            case MACHINE -> "machine:" + localPath;
            default -> kind.wire() + ":" + (driveId == null ? "" : driveId + "/") + folderId;
        };
    }
}
