-- PROD-3.5 : invitation d'un email sans compte (token + acceptation à l'inscription).
CREATE TABLE workspace_invitations (
    id           BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    invited_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    email        VARCHAR(255) NOT NULL,
    role         VARCHAR(20)  NOT NULL DEFAULT 'MEMBER',
    token        VARCHAR(100) NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    expires_at   TIMESTAMP    NOT NULL,
    accepted_at  TIMESTAMP,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by   VARCHAR(255),
    updated_by   VARCHAR(255),
    CONSTRAINT uq_ws_invitation_token UNIQUE (token)
);

CREATE INDEX idx_ws_invitations_workspace ON workspace_invitations(workspace_id);
CREATE INDEX idx_ws_invitations_email     ON workspace_invitations(email);

-- Une seule invitation PENDING par (workspace, email).
CREATE UNIQUE INDEX uq_ws_invitation_pending
    ON workspace_invitations(workspace_id, email)
    WHERE status = 'PENDING';
