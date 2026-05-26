-- ======================================================
-- V28 — Chat : channels, channel_members, chat_messages
-- ======================================================

CREATE TABLE channels (
    id            BIGSERIAL    PRIMARY KEY,
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id    BIGINT                REFERENCES projects(id)   ON DELETE SET NULL,
    kind          VARCHAR(20)  NOT NULL DEFAULT 'CHANNEL',
    name          VARCHAR(100),
    description   VARCHAR(500),
    is_private    BOOLEAN      NOT NULL DEFAULT FALSE,
    is_archived   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by    BIGINT                REFERENCES users(id)      ON DELETE SET NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_workspace ON channels(workspace_id);
CREATE INDEX idx_channels_project   ON channels(project_id);

-- -------------------------------------------------------
-- Members of a channel
-- -------------------------------------------------------
CREATE TABLE channel_members (
    channel_id  BIGINT    NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id     BIGINT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    joined_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX idx_channel_members_user ON channel_members(user_id);

-- -------------------------------------------------------
-- Messages
-- -------------------------------------------------------
CREATE TABLE chat_messages (
    id          BIGSERIAL PRIMARY KEY,
    channel_id  BIGINT    NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id   BIGINT             REFERENCES users(id)    ON DELETE SET NULL,
    content     TEXT      NOT NULL,
    is_edited   BOOLEAN   NOT NULL DEFAULT FALSE,
    is_deleted  BOOLEAN   NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id, created_at);
