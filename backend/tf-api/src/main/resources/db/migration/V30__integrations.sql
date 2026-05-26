-- V30 — Intégrations tierces (GitHub, Slack, Webhooks)
-- Dépend de : V13 (workspaces), V16 (issues), V1 (users)

-- ============================================================
-- Table : integrations (GitHub / Slack par workspace)
-- ============================================================
CREATE TABLE integrations (
    id             BIGSERIAL    PRIMARY KEY,
    workspace_id   BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider       VARCHAR(32)  NOT NULL,           -- GITHUB | SLACK
    access_token   TEXT         NOT NULL,           -- OAuth access token (bot token for Slack)
    meta           JSONB        NOT NULL DEFAULT '{}',  -- ex: {login, avatarUrl} pour GitHub ; {team_id, team_name} pour Slack
    installed_by   BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    connected_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, provider)
);

CREATE INDEX idx_integrations_workspace_id ON integrations(workspace_id);

-- ============================================================
-- Table : issue_github_links (PR / commit lié à une issue)
-- ============================================================
CREATE TABLE issue_github_links (
    id              BIGSERIAL    PRIMARY KEY,
    issue_id        BIGINT       NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    link_type       VARCHAR(16)  NOT NULL,           -- PR | COMMIT
    repo_full_name  VARCHAR(255) NOT NULL,           -- ex: org/repo
    pr_number       INTEGER,                         -- null si COMMIT
    pr_url          VARCHAR(512),
    commit_sha      VARCHAR(40),                     -- null si PR
    commit_url      VARCHAR(512),
    title           VARCHAR(500),
    status          VARCHAR(16)  NOT NULL DEFAULT 'OPEN',  -- OPEN | MERGED | CLOSED
    linked_by       BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    linked_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_issue_github_links_issue_id ON issue_github_links(issue_id);

-- ============================================================
-- Table : slack_channels (canaux de notifs Slack par workspace)
-- ============================================================
CREATE TABLE slack_channels (
    id              BIGSERIAL    PRIMARY KEY,
    workspace_id    BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    channel_id      VARCHAR(64)  NOT NULL,   -- ID Slack du canal (ex: C04XXXXX)
    channel_name    VARCHAR(128) NOT NULL,   -- Nom lisible (ex: #taskforce-notifs)
    event_types     TEXT[]       NOT NULL DEFAULT '{}',  -- ex: {issue.created, cycle.completed}
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_slack_channels_workspace_id ON slack_channels(workspace_id);

-- ============================================================
-- Table : webhooks (webhooks génériques par workspace)
-- ============================================================
CREATE TABLE webhooks (
    id              BIGSERIAL    PRIMARY KEY,
    workspace_id    BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    url             VARCHAR(512) NOT NULL,
    secret          VARCHAR(128),            -- HMAC secret optionnel pour signer les payloads
    event_types     TEXT[]       NOT NULL DEFAULT '{}',  -- ex: {issue.created, issue.deleted}
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    last_fired_at   TIMESTAMP,
    last_status     INTEGER,                 -- dernier HTTP status code reçu
    created_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_workspace_id ON webhooks(workspace_id);
