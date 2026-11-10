-- V123 : le banc dit ce qu'il mesure (R142, séance n°20 du Conseil).
-- Dépend de : V115 (model_capability_runs, model_capability_results), V121 (model_blind_trial_answers).
--
-- model_capability_runs : le chargement du modèle, le premier appel d'un passage, avant que rien ne soit chronométré.
--   load_ms : le temps qu'il a pris ; memory_bytes et gpu_bytes : ce qu'Ollama dit de sa place une fois chargé (la mémoire qu'il
--   occupe, ce qui en tient sur la carte graphique) ; load_problem : 'too_slow' ou 'failed' quand il n'a pas abouti.
-- model_capability_results.too_slow et model_blind_trial_answers.too_slow : pas de réponse dans le budget. Un verdict à part
--   (« Too slow here »), jamais un raté : un modèle qui déborde de la carte graphique n'est pas un mauvais modèle.
ALTER TABLE model_capability_runs
    ADD COLUMN load_ms      BIGINT,
    ADD COLUMN memory_bytes BIGINT,
    ADD COLUMN gpu_bytes    BIGINT,
    ADD COLUMN load_problem VARCHAR(16);

ALTER TABLE model_capability_results
    ADD COLUMN too_slow BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE model_blind_trial_answers
    ADD COLUMN too_slow BOOLEAN NOT NULL DEFAULT FALSE;
