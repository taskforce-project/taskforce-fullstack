-- V62 — Graphes personnalisés épinglés (« Custom »)
--
-- Un graphe généré par l'IA (ou choisi) peut être épinglé pour être conservé et réaffiché plus
-- tard. On stocke sa spec (le JSON `ChartSpec` : mode, dataset/série ou dimension/mesure…) — pas
-- les données, qui restent recalculées à l'affichage depuis les vraies sources. Portée workspace :
-- visible par tous les membres.

CREATE TABLE saved_chart (
    id            BIGSERIAL PRIMARY KEY,
    workspace_id  BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title         VARCHAR(200) NOT NULL,
    spec_json     TEXT        NOT NULL,               -- ChartSpec sérialisé (jamais de données)
    created_by_id BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by    VARCHAR(255),
    updated_by    VARCHAR(255)
);

-- Les graphes épinglés d'un workspace, du plus récent au plus ancien.
CREATE INDEX idx_saved_chart_workspace ON saved_chart (workspace_id, created_at DESC);
