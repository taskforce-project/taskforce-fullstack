-- V37 — Favoris de projet (scopés par utilisateur)

CREATE TABLE project_favorites (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    project_id BIGINT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_project_favorite UNIQUE (user_id, project_id)
);

CREATE INDEX idx_project_favorites_user_id    ON project_favorites(user_id);
CREATE INDEX idx_project_favorites_project_id ON project_favorites(project_id);
