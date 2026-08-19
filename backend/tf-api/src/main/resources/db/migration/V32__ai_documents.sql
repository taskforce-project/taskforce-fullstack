-- ============================================================
-- V32 -- AI documents for RAG indexing
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai_documents (
    id            BIGSERIAL    PRIMARY KEY,
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_type   VARCHAR(32)  NOT NULL,
    source_id     BIGINT       NOT NULL,
    chunk_index   INTEGER      NOT NULL DEFAULT 0,
    title         VARCHAR(500),
    content       TEXT         NOT NULL,
    metadata_json JSONB        NOT NULL DEFAULT '{}',
    embedding     vector(384),
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ai_documents_chunk UNIQUE (workspace_id, source_type, source_id, chunk_index),
    CONSTRAINT chk_ai_documents_source_type CHECK (source_type IN ('ISSUE', 'PAGE', 'DISCUSSION', 'PROJECT', 'ANALYTICS')),
    CONSTRAINT chk_ai_documents_chunk_index_non_negative CHECK (chunk_index >= 0)
);

CREATE INDEX idx_ai_documents_workspace_source ON ai_documents(workspace_id, source_type, source_id);
CREATE INDEX idx_ai_documents_workspace_created ON ai_documents(workspace_id, created_at DESC);
CREATE INDEX idx_ai_documents_embedding_hnsw ON ai_documents USING hnsw (embedding vector_cosine_ops);
