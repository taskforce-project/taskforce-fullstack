-- ============================================================
-- V77 -- Acceptation d'assignation de tâche
-- ============================================================
-- Un membre assigné par un tiers doit ACCEPTER ou REFUSER l'assignation.
--   * assignment_status : PENDING (à valider) | ACCEPTED. NULL = pas d'assigné OU assignation
--     historique (antérieure à la feature) → pas de prompt (traité comme déjà acceptée).
--   * assignment_assigned_by_id : qui a posé l'assignation, pour le prévenir au refus (→ réassigne).
-- Auto-acceptée si on s'assigne soi-même. Au refus : désassignation + notif à l'assigneur.
-- Pas de backfill : les assignations existantes restent NULL (pas de re-validation forcée).

ALTER TABLE issues ADD COLUMN assignment_status VARCHAR(20);
ALTER TABLE issues ADD COLUMN assignment_assigned_by_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
