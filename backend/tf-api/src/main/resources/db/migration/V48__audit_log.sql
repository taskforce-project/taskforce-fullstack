-- V48 — Journal d'audit (RGPD C11.1 + sécurité C21 : journalisation des actions sensibles).
-- FK en ON DELETE SET NULL : le journal survit à la suppression/anonymisation d'un user ou workspace.
CREATE TABLE audit_logs (
    id            BIGSERIAL    PRIMARY KEY,
    workspace_id  BIGINT       REFERENCES workspaces(id) ON DELETE SET NULL,
    actor_user_id BIGINT       REFERENCES users(id)      ON DELETE SET NULL,
    action        VARCHAR(64)  NOT NULL,
    entity_type   VARCHAR(64),
    entity_id     VARCHAR(64),
    details       TEXT,
    ip_address    VARCHAR(45),
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_workspace_id ON audit_logs(workspace_id);
CREATE INDEX idx_audit_logs_actor        ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_created_at   ON audit_logs(created_at);
