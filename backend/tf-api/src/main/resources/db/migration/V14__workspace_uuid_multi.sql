-- V14 — Ajout UUID aux workspaces + support multi-workspace

-- Activer l'extension uuid-ossp si pas déjà présente
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Ajouter la colonne uuid aux workspaces existants
ALTER TABLE workspaces
    ADD COLUMN uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE;

CREATE INDEX idx_workspaces_uuid ON workspaces(uuid);

-- Permettre plusieurs workspaces par utilisateur (retirer contrainte un seul workspace par owner si elle existe)
-- La contrainte n'existe pas en V13, rien à supprimer

-- Commentaire : la limite FREE = 2 workspaces max est enforced côté application
