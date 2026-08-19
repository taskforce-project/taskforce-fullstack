-- V29 — Pièces jointes (attachments) liées aux issues
-- Dépend de : V16 (issues), V1 (users)

CREATE TABLE attachments (
    id             BIGSERIAL    PRIMARY KEY,
    issue_id       BIGINT       NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    uploaded_by    BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    original_name  VARCHAR(255) NOT NULL,
    stored_key     VARCHAR(512) NOT NULL UNIQUE,
    content_type   VARCHAR(128) NOT NULL,
    file_size      BIGINT       NOT NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_issue_id ON attachments(issue_id);
