-- V67 — Compression / résumé glissant des conversations Cortex (mémoire multi-tours bornée)
--
-- Quand un fil grossit, injecter tous les messages sature la fenêtre de contexte. On maintient un
-- **résumé glissant** par conversation : les vieux messages (au-delà des N récents gardés verbatim)
-- sont condensés dans `summary`, et `summary_upto_id` mémorise le dernier message déjà résumé
-- (filigrane). Le prompt = [résumé] + messages récents (id > filigrane).

ALTER TABLE ai_conversation ADD COLUMN summary TEXT;
ALTER TABLE ai_conversation ADD COLUMN summary_upto_id BIGINT;
