-- V55 — Distingue les arêtes générées automatiquement (depuis les [[wikilinks]] du contenu)
-- des arêtes créées à la main. Permet de re-synchroniser les liens auto à chaque édition
-- sans toucher aux relations manuelles. (Les #tags sont stockés dans metadata JSONB — pas de colonne.)
ALTER TABLE knowledge_edges ADD COLUMN auto BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_kedges_from_auto ON knowledge_edges (from_node_id) WHERE auto = TRUE;
