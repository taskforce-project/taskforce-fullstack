-- Règles du harnais (spécification de la v2, §6) : un paquet versionné par espace, au format taskforce-rules/1
-- (contracts/rules/taskforce-rules-1.schema.json). Sans ligne pour un espace, le serveur sert la table par défaut
-- (harness/default.rules.json). Une version ne se modifie jamais : on en écrit une nouvelle.
CREATE TABLE harness_rule_sets (
    id           BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    version      INTEGER   NOT NULL,
    rules        JSONB     NOT NULL,
    created_by   BIGINT    REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_harness_rule_sets_version UNIQUE (workspace_id, version)
);

-- Chaque mission note les règles qu'elle a reçues à la réclamation : la version et l'empreinte du paquet.
ALTER TABLE delivery_runs ADD COLUMN rules_version INTEGER;
ALTER TABLE delivery_runs ADD COLUMN rules_digest  VARCHAR(71);
