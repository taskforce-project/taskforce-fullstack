-- ============================================================
-- V34 -- Assignment events for ranking and feedback loops
-- ============================================================

CREATE TABLE assignment_events (
    id                     BIGSERIAL    PRIMARY KEY,
    workspace_id           BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    issue_id               BIGINT       REFERENCES issues(id) ON DELETE SET NULL,
    assignee_user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_by_user_id    BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    decision_source        VARCHAR(32)  NOT NULL,
    accepted               BOOLEAN,
    resolved_successfully  BOOLEAN,
    features_json          JSONB        NOT NULL DEFAULT '{}',
    created_at             TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_assignment_events_decision_source CHECK (decision_source IN ('MANUAL', 'SMART_ASSIGN', 'FALLBACK'))
);

CREATE INDEX idx_assignment_events_workspace_created ON assignment_events(workspace_id, created_at DESC);
CREATE INDEX idx_assignment_events_issue_id ON assignment_events(issue_id);
CREATE INDEX idx_assignment_events_assignee ON assignment_events(assignee_user_id);
CREATE INDEX idx_assignment_events_decision_source ON assignment_events(decision_source);
