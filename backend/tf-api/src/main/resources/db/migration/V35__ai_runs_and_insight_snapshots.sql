-- ============================================================
-- V35 -- AI observability and insight snapshots
-- ============================================================

CREATE TABLE ai_runs (
    id             BIGSERIAL    PRIMARY KEY,
    workspace_id   BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    feature_name   VARCHAR(64)  NOT NULL,
    provider       VARCHAR(32)  NOT NULL,
    model_name     VARCHAR(128) NOT NULL,
    latency_ms     INTEGER,
    input_tokens   INTEGER,
    output_tokens  INTEGER,
    status         VARCHAR(32)  NOT NULL,
    fallback_used  BOOLEAN      NOT NULL DEFAULT FALSE,
    request_hash   VARCHAR(128),
    meta_json      JSONB        NOT NULL DEFAULT '{}',
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMP    NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    CONSTRAINT chk_ai_runs_latency_non_negative CHECK (latency_ms IS NULL OR latency_ms >= 0),
    CONSTRAINT chk_ai_runs_input_tokens_non_negative CHECK (input_tokens IS NULL OR input_tokens >= 0),
    CONSTRAINT chk_ai_runs_output_tokens_non_negative CHECK (output_tokens IS NULL OR output_tokens >= 0)
);

CREATE INDEX idx_ai_runs_workspace_created ON ai_runs(workspace_id, created_at DESC);
CREATE INDEX idx_ai_runs_feature_created ON ai_runs(feature_name, created_at DESC);
CREATE INDEX idx_ai_runs_status_created ON ai_runs(status, created_at DESC);
CREATE INDEX idx_ai_runs_expires_at ON ai_runs(expires_at);

CREATE TABLE ai_insight_snapshots (
    id                   BIGSERIAL    PRIMARY KEY,
    workspace_id         BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    snapshot_date        DATE         NOT NULL,
    summary_text         TEXT,
    exceptions_json      JSONB        NOT NULL DEFAULT '[]',
    agents_json          JSONB        NOT NULL DEFAULT '[]',
    source_metrics_json  JSONB        NOT NULL DEFAULT '{}',
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    expires_at           TIMESTAMP    NOT NULL DEFAULT (NOW() + INTERVAL '180 days'),
    CONSTRAINT uq_ai_insight_snapshots_workspace_date UNIQUE (workspace_id, snapshot_date)
);

CREATE INDEX idx_ai_insight_snapshots_workspace_date ON ai_insight_snapshots(workspace_id, snapshot_date DESC);
CREATE INDEX idx_ai_insight_snapshots_expires_at ON ai_insight_snapshots(expires_at);
