-- Runner local de delegation (TF-AGENT-DELIVERY, ADR-013). Le backend ne peut pas joindre le poste
-- de l'utilisateur : le run d'un provider "pull" reste QUEUED jusqu'a ce qu'un runner le reclame.
--   claimed_by   = client Keycloak du runner (claim azp du jeton de compte de service)
--   claimed_at   = debut de la session deleguee (borne sa duree de vie)
--   heartbeat_at = dernier signe de vie du runner (muet trop longtemps = run en echec)
ALTER TABLE delivery_runs
    ADD COLUMN claimed_by   VARCHAR(120),
    ADD COLUMN claimed_at   TIMESTAMP,
    ADD COLUMN heartbeat_at TIMESTAMP;

-- File d'attente : le plus ancien run QUEUED d'un provider donne.
CREATE INDEX idx_delivery_runs_queue ON delivery_runs(provider_key, status, created_at);
