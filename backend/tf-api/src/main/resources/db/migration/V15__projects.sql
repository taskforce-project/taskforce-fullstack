-- V15 — Projects, membres de projet et labels
-- Dépend de : V13 (workspaces), V1 (users)
-- Chaque projet appartient à un workspace

-- ============================================================
-- Type ENUM PostgreSQL
-- ============================================================

CREATE TYPE project_status AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE project_role   AS ENUM ('LEAD', 'MEMBER', 'VIEWER');

-- ============================================================
-- Table projects
-- ============================================================

CREATE TABLE projects (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    identifier      VARCHAR(10)  NOT NULL,   -- ex: "WEB", "API" — court, unique par workspace
    description     VARCHAR(1000),
    status          project_status NOT NULL DEFAULT 'ACTIVE',
    is_public       BOOLEAN      NOT NULL DEFAULT false,
    created_by      BIGINT       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_project_identifier UNIQUE (workspace_id, identifier)
);

CREATE INDEX idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX idx_projects_status       ON projects(status);
CREATE INDEX idx_projects_created_by   ON projects(created_by);

-- ============================================================
-- Table project_members
-- ============================================================

CREATE TABLE project_members (
    id          BIGSERIAL    PRIMARY KEY,
    project_id  BIGINT       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     BIGINT       NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    role        project_role NOT NULL DEFAULT 'MEMBER',
    added_by    BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    joined_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_project_member UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id    ON project_members(user_id);

-- ============================================================
-- Table project_labels
-- ============================================================

CREATE TABLE project_labels (
    id          BIGSERIAL    PRIMARY KEY,
    project_id  BIGINT       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        VARCHAR(50)  NOT NULL,
    color       VARCHAR(30)  NOT NULL DEFAULT '#6366f1',
    description VARCHAR(200),
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_project_label_name UNIQUE (project_id, name)
);

CREATE INDEX idx_project_labels_project_id ON project_labels(project_id);
