-- PROD-2.8b : couleur d'accent du projet (classe Tailwind, ex: 'bg-violet-500').
-- Aligné sur le pattern teams.color (V26). Défaut neutre = 'bg-primary'.
ALTER TABLE projects ADD COLUMN color VARCHAR(50) NOT NULL DEFAULT 'bg-primary';
