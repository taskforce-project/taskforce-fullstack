-- V22 — Table issue_relations : liens entre issues (blocks, duplicate, relates-to, etc.)

CREATE TYPE issue_relation_type AS ENUM ('BLOCKS', 'BLOCKED_BY', 'DUPLICATE', 'RELATES_TO');

CREATE TABLE issue_relations (
    id              BIGSERIAL           PRIMARY KEY,
    source_id       BIGINT              NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    target_id       BIGINT              NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    relation_type   issue_relation_type NOT NULL,
    created_by      BIGINT              NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
    created_at      TIMESTAMP           NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_issue_relation UNIQUE (source_id, target_id, relation_type),
    CONSTRAINT chk_self_relation CHECK (source_id <> target_id)
);

CREATE INDEX idx_issue_relations_source_id ON issue_relations(source_id);
CREATE INDEX idx_issue_relations_target_id ON issue_relations(target_id);
