-- Rejoindre un PROJET exige désormais l'acceptation de l'invité (fini l'ajout direct).
-- L'invitation existante (workspace) peut porter un contexte projet : à l'acceptation, la personne
-- est ajoutée au workspace ET au projet, avec le rôle projet indiqué. NULL = invitation workspace simple.
ALTER TABLE workspace_invitations
    ADD COLUMN project_id   BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    ADD COLUMN project_role VARCHAR(20);

CREATE INDEX idx_ws_invitations_project ON workspace_invitations(project_id);
