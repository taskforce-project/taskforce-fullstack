-- V21 — Ajout du champ position sur la table issues
-- Utilisé pour l'ordonnancement dans les colonnes kanban.
-- Valeur par défaut 0 ; la séquence réelle sera initialisée
-- par la logique applicative lors du prochain tri.

ALTER TABLE issues
    ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_issues_position ON issues(project_id, status_id, position);
