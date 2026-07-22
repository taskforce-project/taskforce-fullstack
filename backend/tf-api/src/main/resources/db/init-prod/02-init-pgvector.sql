-- ===============================
-- SCRIPT D'INITIALISATION - PGVECTOR (PROD)
-- ===============================
-- Active l'extension `vector` dans la base applicative, avant toute migration Flyway.
--
-- Non optionnel : les migrations V32 (ai_documents), V33 (member_skill_profiles), V52 et V59
-- (embeddings du Brain OS) déclarent des colonnes `vector(384)`. Sans l'extension, Flyway échoue
-- au premier démarrage et l'application ne monte pas.
--
-- L'image doit également embarquer le binaire de l'extension : `pgvector/pgvector:*`.
-- Un `postgres:*-alpine` standard ne le contient pas et ce CREATE EXTENSION échouerait.

CREATE EXTENSION IF NOT EXISTS vector;
