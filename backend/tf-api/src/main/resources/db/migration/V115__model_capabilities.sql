-- V115 : ce que sait faire chaque modèle, mesuré sur la machine ou le serveur (R113, séance n°16 du Conseil).
-- Dépend de : V1 (users, workspaces).
--
-- Les cas sont fixes, écrits dans le code (CapabilitySuite) et versionnés : ils ne naissent pas d'une réponse comme ceux
-- de la banque (V108). Un modèle se mesure à la demande ; la table montre la dernière mesure de chaque modèle, avec sa
-- date et sa note, pour toute l'instance : c'est le modèle de cette machine qu'on mesure, pas un espace.
--
-- model_capability_runs : une mesure d'un modèle, lancée depuis un espace (le quota et le frein de débit de l'IA sont
--   ceux de son compte) ; total = les cas de la suite au départ.
-- model_capability_results : la note d'un cas dans une mesure, une seule fois. details : les critères vérifiés, les
--   appels du modèle et un extrait de sa réponse.
-- ai_model_choices : le modèle que la personne a choisi pour Cortex dans la webapp ; sans ligne, celui de l'instance.
--   L'app desktop règle le sien dans ses réglages d'IA, sur l'ordinateur.
CREATE TABLE model_capability_runs (
    id             BIGSERIAL    PRIMARY KEY,
    workspace_id   BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    started_by     BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    started_at     TIMESTAMP    NOT NULL,
    finished_at    TIMESTAMP,
    model          VARCHAR(128) NOT NULL,
    suite_version  INTEGER      NOT NULL,
    total          INTEGER      NOT NULL,
    passed         INTEGER      NOT NULL DEFAULT 0
);

CREATE INDEX idx_model_capability_runs_model ON model_capability_runs (model, started_at);

CREATE TABLE model_capability_results (
    id             BIGSERIAL    PRIMARY KEY,
    run_id         BIGINT       NOT NULL REFERENCES model_capability_runs(id) ON DELETE CASCADE,
    case_key       VARCHAR(64)  NOT NULL,
    capability     VARCHAR(32)  NOT NULL,
    passed         BOOLEAN      NOT NULL,
    details        TEXT         NOT NULL,
    created_at     TIMESTAMP    NOT NULL,
    CONSTRAINT uq_model_capability_results_run_case UNIQUE (run_id, case_key)
);

CREATE TABLE ai_model_choices (
    user_id        BIGINT       PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    model          VARCHAR(128) NOT NULL,
    chosen_at      TIMESTAMP    NOT NULL
);
