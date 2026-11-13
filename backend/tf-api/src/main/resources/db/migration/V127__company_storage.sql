-- ============================================================
-- V127 -- ou TaskForce range ce qu'il ecrit, et ou vit chaque document
-- (TF-J2-14 ; seance n°22 du Conseil, R156, avec R93)
-- ============================================================
-- Depend de : V13 (workspaces), V1 (users), la table projects.
--
-- 1. storage_targets : ou TaskForce range ce qu'il ecrit, pour un espace (project_id nul) et, si un projet le veut,
--    pour ce projet. kind : SERVER (le stockage de TaskForce, le defaut quand rien n'est choisi), MACHINE (un dossier
--    choisi sur l'ordinateur, app desktop seulement), GOOGLE_DRIVE, ONEDRIVE (OneDrive ou SharePoint). La colonne n'est
--    pas fermee par une contrainte : Box, Dropbox et Nextcloud s'ajouteront dans le code, sans migration. Pour le
--    stockage de l'entreprise : la cle du connecteur, le lecteur (drive_id, Microsoft), le dossier (folder_id) et ce que
--    l'ecran en montre (folder_name, folder_url) ; pour la machine, le chemin du dossier (local_path).
-- 2. stored_documents : le registre de ce que TaskForce a range (R156 : « le dossier dit ou vit chaque document ») :
--    la cible, l'emplacement (cle d'objet, chemin ou identifiant chez l'editeur), le lien, la version chez l'editeur,
--    l'empreinte et la taille, la personne pour qui il a ete ecrit et celle qui a accorde la sortie, et le dossier de
--    cette sortie (R93 : chaque sortie est journalisee avec sa destination et son volume).

-- 1. La cible de l'espace, et celle d'un projet
CREATE TABLE storage_targets (
    id            BIGSERIAL    PRIMARY KEY,
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id    BIGINT       REFERENCES projects(id) ON DELETE CASCADE,
    kind          VARCHAR(24)  NOT NULL,
    connector_key VARCHAR(64),
    drive_id      VARCHAR(255),
    folder_id     VARCHAR(512),
    folder_name   VARCHAR(255),
    folder_url    TEXT,
    local_path    TEXT,
    chosen_by     BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by    VARCHAR(255),
    updated_by    VARCHAR(255)
);
CREATE UNIQUE INDEX uq_storage_targets_workspace ON storage_targets (workspace_id) WHERE project_id IS NULL;
CREATE UNIQUE INDEX uq_storage_targets_project ON storage_targets (project_id) WHERE project_id IS NOT NULL;

-- 2. Ou vit chaque document
CREATE TABLE stored_documents (
    id            BIGSERIAL    PRIMARY KEY,
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id    BIGINT       REFERENCES projects(id) ON DELETE SET NULL,
    title         VARCHAR(255) NOT NULL,
    file_name     VARCHAR(255) NOT NULL,
    media_type    VARCHAR(127) NOT NULL,
    size_bytes    BIGINT       NOT NULL,
    sha256        VARCHAR(64)  NOT NULL,
    kind          VARCHAR(24)  NOT NULL,
    connector_key VARCHAR(64),
    location      TEXT         NOT NULL,
    drive_id      VARCHAR(255),
    folder_name   VARCHAR(255),
    web_url       TEXT,
    version       VARCHAR(255),
    requested_by  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    approved_by   BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    via           VARCHAR(24)  NOT NULL,
    record_id     UUID,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by    VARCHAR(255),
    updated_by    VARCHAR(255)
);
CREATE INDEX idx_stored_documents_workspace ON stored_documents (workspace_id, created_at DESC);
CREATE INDEX idx_stored_documents_project ON stored_documents (project_id);
