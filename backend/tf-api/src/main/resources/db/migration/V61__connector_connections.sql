-- V61 — Connexions génériques du catalogue d'intégrations
--
-- Jusqu'ici seuls GitHub / Slack / Plane avaient un stockage (table `integrations`, couplée à
-- l'enum `IntegrationProvider`). Pour rendre TOUT le catalogue connectable sans étendre cet enum à
-- chaque outil, on ajoute une table générique, découplée : une ligne = un connecteur connecté sur
-- un workspace, avec sa configuration (clés/tokens) sérialisée en JSON et **chiffrée au repos**
-- (même converter que `integrations.access_token`). La couche « sync par service » viendra dessus.

CREATE TABLE connector_connection (
    id            BIGSERIAL PRIMARY KEY,
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    connector_key VARCHAR(64)  NOT NULL,               -- clé du catalogue (ex. 'notion', 'stripe')
    config        TEXT         NOT NULL DEFAULT '{}',  -- JSON des champs de connexion, chiffré
    connected_by  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by    VARCHAR(255),
    updated_by    VARCHAR(255)
);

-- Un connecteur n'est connecté qu'une fois par workspace.
CREATE UNIQUE INDEX uq_connector_connection ON connector_connection (workspace_id, connector_key);
