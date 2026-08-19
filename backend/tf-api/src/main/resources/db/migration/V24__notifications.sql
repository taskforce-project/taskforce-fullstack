-- V24: Table notifications
CREATE TABLE notifications (
    id            BIGSERIAL PRIMARY KEY,
    recipient_id  BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    type          VARCHAR(50)  NOT NULL,
    urgency       VARCHAR(20)  NOT NULL DEFAULT 'info',
    read          BOOLEAN      NOT NULL DEFAULT false,
    acknowledged  BOOLEAN      NOT NULL DEFAULT false,
    title         VARCHAR(512) NOT NULL,
    body          TEXT,
    issue_identifier VARCHAR(50),
    issue_url     VARCHAR(512),
    project_name  VARCHAR(255),
    project_url   VARCHAR(512),
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_recipient_id ON notifications(recipient_id);
CREATE INDEX idx_notif_workspace_id ON notifications(workspace_id);
CREATE INDEX idx_notif_read         ON notifications(read);
CREATE INDEX idx_notif_created_at   ON notifications(created_at);
