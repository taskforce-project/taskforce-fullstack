-- V23 — Tables cycles et cycle_issues

CREATE TYPE cycle_status AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED');

CREATE TABLE cycles (
    id          BIGSERIAL       PRIMARY KEY,
    project_id  BIGINT          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        VARCHAR(255)    NOT NULL,
    description TEXT,
    start_date  DATE,
    end_date    DATE,
    status      cycle_status    NOT NULL DEFAULT 'DRAFT',
    created_by  BIGINT          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP       NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cycle_name_project UNIQUE (project_id, name)
);

CREATE INDEX idx_cycles_project_id ON cycles(project_id);
CREATE INDEX idx_cycles_status     ON cycles(status);

CREATE TABLE cycle_issues (
    id         BIGSERIAL PRIMARY KEY,
    cycle_id   BIGINT    NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
    issue_id   BIGINT    NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    added_by   BIGINT    NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
    added_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cycle_issue UNIQUE (cycle_id, issue_id)
);

CREATE INDEX idx_cycle_issues_cycle_id ON cycle_issues(cycle_id);
CREATE INDEX idx_cycle_issues_issue_id ON cycle_issues(issue_id);
