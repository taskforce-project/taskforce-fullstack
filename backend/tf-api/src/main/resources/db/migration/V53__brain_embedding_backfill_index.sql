-- V53 — Index partiel pour l'indexation paresseuse des embeddings.
-- Rend le repérage des nodes non-embeddés O(résultats) au lieu d'un scan complet :
-- quand tout est indexé (cas nominal), la requête de backfill est quasi instantanée.
CREATE INDEX idx_knodes_missing_embedding
    ON knowledge_nodes (workspace_id)
    WHERE embedding IS NULL;
