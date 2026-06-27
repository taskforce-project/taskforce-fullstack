-- V50 — Archivage & épinglage des issues (menu d'actions façon GitHub).
-- archived_at : NULL = active ; renseignée = masquée des vues par défaut (board/list/paged).
-- pinned      : remonte l'issue en tête de liste.
ALTER TABLE issues
    ADD COLUMN archived_at TIMESTAMP NULL,
    ADD COLUMN pinned      BOOLEAN   NOT NULL DEFAULT FALSE;

-- Filtrage fréquent « issues actives d'un projet, épinglées d'abord ».
CREATE INDEX idx_issues_project_archived ON issues(project_id, archived_at);
CREATE INDEX idx_issues_project_pinned   ON issues(project_id, pinned);
