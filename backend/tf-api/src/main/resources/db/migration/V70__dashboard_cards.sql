-- V70 — Cartes de dashboard épinglées, par utilisateur et par workspace
--
-- Chaque membre compose SON dashboard : les cartes (type, titre, config, période) sont persistées
-- par (user, workspace) et ordonnées par `position`. Au premier accès, le service crée les 4 cartes
-- par défaut (bootstrap persistant — donc supprimables ensuite). La `config` est un JSON libre côté
-- front (ex. taille de carte, spec de graphe IA) : on la stocke en jsonb, jamais de données calculées.

CREATE TABLE dashboard_cards (
    id           BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_type    VARCHAR(40) NOT NULL,                  -- clé du registre front (ex. "ops-health")
    title        VARCHAR(200),                          -- titre personnalisé (null = titre du registre)
    config       JSONB       NOT NULL DEFAULT '{}',     -- config libre (size, spec IA…), jamais de données
    time_range   VARCHAR(10),                           -- période d'affichage (ex. "30d")
    position     INT         NOT NULL DEFAULT 0,        -- ordre d'affichage (0-based, croissant)
    created_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by   VARCHAR(255),
    updated_by   VARCHAR(255)
);

-- Le dashboard d'un membre : toutes ses cartes d'un workspace, triées par position.
CREATE INDEX idx_dashboard_cards_workspace_user ON dashboard_cards (workspace_id, user_id);
