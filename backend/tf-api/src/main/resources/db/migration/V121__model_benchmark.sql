-- V121 : le banc des modèles (R131, séance n°19 du Conseil) : « que puis-je confier à ce modèle ? ».
-- Dépend de : V1 (users, workspaces), V16 (issues), V115 (model_capability_runs, model_capability_results).
--
-- Le banc se range dans les tables des capacités, sa suite à côté de la leur :
--   model_capability_runs.suite : 'capability' (R113, la table de ce que sait faire chaque modèle) ou 'benchmark' (R131).
--   model_capability_results : duration_ms, le temps de la réponse ; person_passed, la note retournée par une personne
--     (null : celle du code compte) ; person_id et person_at, qui et quand. La réponse, plafonnée, reste dans details.
--
-- model_blind_trials : un essai à l'aveugle sur une issue réelle, lancé et vu par une seule personne.
--   chosen_letter : la lettre choisie, null quand aucune réponse n'a été retenue ; decided_at : null tant qu'elle n'a pas choisi.
--   Une réponse tirée d'une vraie issue part avec cette issue, avec la personne ou avec l'espace (ON DELETE CASCADE).
-- model_blind_trial_answers : une lettre, son modèle (tiré au hasard par le serveur), sa réponse plafonnée ; answer reste
--   null tant que le modèle n'a pas répondu.
ALTER TABLE model_capability_runs ADD COLUMN suite VARCHAR(32) NOT NULL DEFAULT 'capability';

CREATE INDEX idx_model_capability_runs_workspace_suite ON model_capability_runs (workspace_id, suite, started_at);

ALTER TABLE model_capability_results
    ADD COLUMN duration_ms   BIGINT,
    ADD COLUMN person_passed BOOLEAN,
    ADD COLUMN person_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN person_at     TIMESTAMP;

CREATE TABLE model_blind_trials (
    id             BIGSERIAL    PRIMARY KEY,
    workspace_id   BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id        BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id     BIGINT       NOT NULL,
    issue_id       BIGINT       NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    issue_key      VARCHAR(64)  NOT NULL,
    task           VARCHAR(32)  NOT NULL,
    started_at     TIMESTAMP    NOT NULL,
    decided_at     TIMESTAMP,
    chosen_letter  VARCHAR(1)
);

CREATE INDEX idx_model_blind_trials_person ON model_blind_trials (workspace_id, user_id, decided_at);

CREATE TABLE model_blind_trial_answers (
    id             BIGSERIAL    PRIMARY KEY,
    trial_id       BIGINT       NOT NULL REFERENCES model_blind_trials(id) ON DELETE CASCADE,
    letter         VARCHAR(1)   NOT NULL,
    model          VARCHAR(128) NOT NULL,
    answer         TEXT,
    duration_ms    BIGINT,
    CONSTRAINT uq_model_blind_trial_answers_letter UNIQUE (trial_id, letter)
);
