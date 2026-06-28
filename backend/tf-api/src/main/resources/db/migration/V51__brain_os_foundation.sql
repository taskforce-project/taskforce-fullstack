-- V51 — Brain OS : couche de connaissance par workspace (Phase 0, relationnel pur).
-- 1 workspace = 1 brain. Graphe parallèle (knowledge_nodes) qui peut pointer vers
-- des issues/projets via ref_type/ref_id, mais existe aussi pour des artefacts sans
-- équivalent PM (ADR, SOP, runbook, finding…).
-- NB : la colonne d'embedding (pgvector) et l'index HNSW arrivent en V52 (Phase 1) afin
-- de ne jamais bloquer le boot si l'extension vector posait problème.

-- ── Brain par workspace ──────────────────────────────────────────────────────
CREATE TABLE brain_workspaces (
    id            BIGSERIAL    PRIMARY KEY,
    workspace_id  BIGINT       NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    template_type VARCHAR(40)  NOT NULL DEFAULT 'BLANK',
    version_label VARCHAR(20)  NOT NULL DEFAULT 'v1',
    created_at    TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT now(),
    created_by    VARCHAR(255),
    updated_by    VARCHAR(255)
);

-- ── Nodes de connaissance ────────────────────────────────────────────────────
CREATE TABLE knowledge_nodes (
    id            BIGSERIAL    PRIMARY KEY,
    uuid          UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    brain_id      BIGINT       REFERENCES brain_workspaces(id) ON DELETE CASCADE,
    type          VARCHAR(40)  NOT NULL,
    domain        VARCHAR(40)  NOT NULL,
    title         VARCHAR(300) NOT NULL,
    content       TEXT,
    content_url   VARCHAR(1000),
    status        VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    version_label VARCHAR(20)  NOT NULL DEFAULT 'v1',
    ref_type      VARCHAR(20),
    ref_id        BIGINT,
    metadata      JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT now(),
    created_by    VARCHAR(255),
    updated_by    VARCHAR(255)
);

CREATE INDEX idx_knodes_workspace        ON knowledge_nodes(workspace_id);
CREATE INDEX idx_knodes_workspace_domain ON knowledge_nodes(workspace_id, domain);
CREATE INDEX idx_knodes_workspace_status ON knowledge_nodes(workspace_id, status);
CREATE INDEX idx_knodes_ref              ON knowledge_nodes(ref_type, ref_id);

-- ── Arêtes du graphe ─────────────────────────────────────────────────────────
CREATE TABLE knowledge_edges (
    id            BIGSERIAL        PRIMARY KEY,
    workspace_id  BIGINT           NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    from_node_id  BIGINT           NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    to_node_id    BIGINT           NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    relation_type VARCHAR(40)      NOT NULL,
    weight        DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    created_at    TIMESTAMP        NOT NULL DEFAULT now(),
    created_by    VARCHAR(255),
    CONSTRAINT uq_kedge UNIQUE (from_node_id, to_node_id, relation_type),
    CONSTRAINT ck_kedge_no_self CHECK (from_node_id <> to_node_id)
);

CREATE INDEX idx_kedges_workspace ON knowledge_edges(workspace_id);
CREATE INDEX idx_kedges_from      ON knowledge_edges(from_node_id);
CREATE INDEX idx_kedges_to        ON knowledge_edges(to_node_id);
