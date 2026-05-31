-- ============================================================
-- V33 -- Member skill profiles for Smart Assign
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE member_skill_profiles (
    id            BIGSERIAL    PRIMARY KEY,
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_text  TEXT,
    skills_json   JSONB        NOT NULL DEFAULT '{}',
    stats_json    JSONB        NOT NULL DEFAULT '{}',
    embedding     vector(384),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_member_skill_profiles_workspace_user UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_member_skill_profiles_workspace ON member_skill_profiles(workspace_id);
CREATE INDEX idx_member_skill_profiles_user ON member_skill_profiles(user_id);
CREATE INDEX idx_member_skill_profiles_embedding_hnsw ON member_skill_profiles USING hnsw (embedding vector_cosine_ops);
