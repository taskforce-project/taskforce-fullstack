-- V49 — Disponibilité des membres : congés / indisponibilités (US-006).
CREATE TABLE member_leaves (
    id           BIGSERIAL    PRIMARY KEY,
    workspace_id BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      BIGINT       NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    type         VARCHAR(20)  NOT NULL,
    start_date   DATE         NOT NULL,
    end_date     DATE         NOT NULL,
    note         TEXT,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by   VARCHAR(255),
    updated_by   VARCHAR(255)
);

CREATE INDEX idx_member_leaves_workspace_user ON member_leaves(workspace_id, user_id);
CREATE INDEX idx_member_leaves_workspace_dates ON member_leaves(workspace_id, start_date, end_date);
