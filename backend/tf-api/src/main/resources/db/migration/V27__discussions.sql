CREATE TABLE discussions (
    id          BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    author_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    title       VARCHAR(500) NOT NULL,
    body        TEXT,
    category    VARCHAR(20)  NOT NULL DEFAULT 'GENERAL',
    state       VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    is_pinned   BOOLEAN      NOT NULL DEFAULT FALSE,
    is_locked   BOOLEAN      NOT NULL DEFAULT FALSE,
    reply_count INT          NOT NULL DEFAULT 0,
    reaction_count INT       NOT NULL DEFAULT 0,
    tags        VARCHAR(500),
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_discussions_workspace_id ON discussions(workspace_id);
CREATE INDEX idx_discussions_category     ON discussions(category);
CREATE INDEX idx_discussions_state        ON discussions(state);
