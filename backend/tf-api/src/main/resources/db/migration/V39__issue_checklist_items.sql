-- V39 — Checklist d'items par issue (PROD-2.3)

CREATE TABLE issue_checklist_items (
    id         BIGSERIAL    PRIMARY KEY,
    issue_id   BIGINT       NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    content    VARCHAR(500) NOT NULL,
    is_done    BOOLEAN      NOT NULL DEFAULT FALSE,
    position   INT          NOT NULL DEFAULT 0,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_issue_checklist_items_issue_id ON issue_checklist_items(issue_id);
