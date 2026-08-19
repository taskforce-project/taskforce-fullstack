-- V59 — Brain OS : passage des embeddings de all-MiniLM-L6-v2 (384d) à BGE-M3 (1024d, via Ollama).
-- Le changement de dimension impose de recalculer tous les vecteurs : on repart de NULL, puis
-- BrainSearchService ré-embeddera les nodes en tâche de fond (index partiel V53 WHERE embedding IS NULL).

-- 1. L'index HNSW est lié à la dimension : on le supprime avant l'ALTER TYPE.
DROP INDEX IF EXISTS idx_knodes_embedding;

-- 2. Purge des vecteurs 384d existants (incompatibles avec la nouvelle dimension).
UPDATE knowledge_nodes SET embedding = NULL WHERE embedding IS NOT NULL;

-- 3. Redimensionnement de la colonne pgvector 384 -> 1024.
ALTER TABLE knowledge_nodes ALTER COLUMN embedding TYPE vector(1024);

-- 4. Recréation de l'index HNSW (cosine) sur la nouvelle dimension.
CREATE INDEX idx_knodes_embedding ON knowledge_nodes USING hnsw (embedding vector_cosine_ops);
