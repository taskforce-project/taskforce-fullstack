-- ============================================================
-- V124 -- une connexion par personne, l'application de l'entreprise, les inscriptions par emetteur
-- (TF-J2-12, TF-J2-13 ; seance n°22 du Conseil, R154 et R158)
-- ============================================================
-- Depend de : V61 (connector_connection), V82 (mcp_oauth_states), V13 (workspaces), V1 (users).
--
-- 1. connector_connection : jusqu'ici une connexion valait pour tout l'espace, avec les droits de qui l'avait
--    faite. Desormais une connexion appartient a une personne (scope PERSONAL, owner_id) ; une connexion d'espace
--    (scope WORKSPACE, owner_id nul) n'existe que pour une source qu'un proprietaire marque comme partagee. Les
--    lignes existantes restent des connexions d'espace. L'unicite devient : une connexion d'espace par outil et par
--    espace, une connexion personnelle par outil, par espace et par personne.
--    state : CONNECTED, NEEDS_RECONNECT (le jeton ne se renouvelle plus), WAITING_FOR_ADMIN (l'editeur attend son
--    administrateur). account_label : le compte chez l'editeur (« Connected as ... »). tools_pin : la liste des
--    outils figee a la connexion (empreinte de chaque outil) ; un outil dont la description ou le schema change
--    redemande l'accord (R158).
-- 2. connector_app : l'application de l'entreprise (chemin C), que son administrateur saisit une fois ; le secret est
--    chiffre au repos (EncryptedStringConverter).
-- 3. mcp_oauth_client : les inscriptions dynamiques (DCR), gardees par emetteur et par adresse de retour (norme MCP
--    du 28/07/2026) : une seule inscription par serveur d'autorisation, au lieu d'une par connexion.
-- 4. mcp_oauth_states : ce que le retour du navigateur doit savoir de plus.

-- 1. Une connexion par personne
ALTER TABLE connector_connection ADD COLUMN owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE connector_connection ADD COLUMN scope VARCHAR(16) NOT NULL DEFAULT 'WORKSPACE';
ALTER TABLE connector_connection ADD COLUMN state VARCHAR(24) NOT NULL DEFAULT 'CONNECTED';
ALTER TABLE connector_connection ADD COLUMN account_label VARCHAR(255);
ALTER TABLE connector_connection ADD COLUMN tools_pin TEXT;
ALTER TABLE connector_connection ADD COLUMN pinned_at TIMESTAMP;

ALTER TABLE connector_connection ADD CONSTRAINT ck_connector_connection_scope CHECK (
    (scope = 'WORKSPACE' AND owner_id IS NULL) OR (scope = 'PERSONAL' AND owner_id IS NOT NULL));
ALTER TABLE connector_connection ADD CONSTRAINT ck_connector_connection_state CHECK (
    state IN ('CONNECTED', 'NEEDS_RECONNECT', 'WAITING_FOR_ADMIN'));

DROP INDEX uq_connector_connection;
CREATE UNIQUE INDEX uq_connector_connection_workspace
    ON connector_connection (workspace_id, connector_key) WHERE owner_id IS NULL;
CREATE UNIQUE INDEX uq_connector_connection_personal
    ON connector_connection (workspace_id, connector_key, owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_connector_connection_owner ON connector_connection (owner_id);

-- 2. L'application de l'entreprise
CREATE TABLE connector_app (
    id            BIGSERIAL    PRIMARY KEY,
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    connector_key VARCHAR(64)  NOT NULL,
    client_id     VARCHAR(512) NOT NULL,
    client_secret TEXT,                                  -- chiffre au repos ; nul pour un client public
    saved_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by    VARCHAR(255),
    updated_by    VARCHAR(255)
);
CREATE UNIQUE INDEX uq_connector_app ON connector_app (workspace_id, connector_key);

-- 3. Les inscriptions dynamiques, par emetteur
CREATE TABLE mcp_oauth_client (
    id            BIGSERIAL    PRIMARY KEY,
    issuer        TEXT         NOT NULL,
    redirect_uri  TEXT         NOT NULL,
    client_id     VARCHAR(512) NOT NULL,
    client_secret TEXT,                                  -- chiffre au repos ; nul pour un client public
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_mcp_oauth_client ON mcp_oauth_client (issuer, redirect_uri);

-- 4. Le flux en cours
ALTER TABLE mcp_oauth_states ADD COLUMN shared BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE mcp_oauth_states ADD COLUMN allow_writes BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE mcp_oauth_states ADD COLUMN resource TEXT;
ALTER TABLE mcp_oauth_states ADD COLUMN revocation_endpoint TEXT;
ALTER TABLE mcp_oauth_states ADD COLUMN client_source VARCHAR(16);
ALTER TABLE mcp_oauth_states ADD COLUMN iss_required BOOLEAN NOT NULL DEFAULT FALSE;
