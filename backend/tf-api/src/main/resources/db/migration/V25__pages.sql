-- V25__pages.sql
-- Pages/Wiki associées à un projet

CREATE TABLE pages (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_by  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    title       VARCHAR(500) NOT NULL,
    emoji       VARCHAR(10)  NOT NULL DEFAULT '📄',
    content     TEXT,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pages_project_id ON pages(project_id);
CREATE INDEX idx_pages_created_by ON pages(created_by);
