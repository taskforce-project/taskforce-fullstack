-- V52 — Brain OS Phase 1 : embeddings vectoriels pour la recherche sémantique.
-- Séparé de V51 (relationnel) pour isoler la dépendance pgvector.
-- L'extension est fournie par l'image pgvector/pgvector ; CREATE est idempotent.
CREATE EXTENSION IF NOT EXISTS vector;

-- all-MiniLM-L6-v2 = 384 dimensions. NULL tant que le node n'est pas (encore) embeddé.
ALTER TABLE knowledge_nodes ADD COLUMN embedding vector(384);

-- Index HNSW (cosine) pour la recherche par similarité. Les lignes NULL sont ignorées ;
-- l'index se remplit au fur et à mesure que les embeddings sont calculés.
CREATE INDEX idx_knodes_embedding ON knowledge_nodes USING hnsw (embedding vector_cosine_ops);
