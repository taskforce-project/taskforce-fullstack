-- La banque d'évaluations de Cortex (R61, séance n°10). Un cas est figé : la
-- question, la date et les notes servies ce jour-là, ce que les outils de lecture ont rendu (la cassette), et des
-- critères qu'un programme vérifie, datés avant tout rejeu. Un rejeu ne touche jamais l'espace : une lecture est servie
-- par la cassette, une écriture est proposée, jamais exécutée.
--
-- eval_cases : les cas d'un espace, tirés du dossier d'une réponse de Cortex (source_record), que la personne confirme.
-- eval_runs : un rejeu de la banque avec un modèle nommé ; total = les cas actifs au départ.
-- eval_results : la note d'un cas dans un rejeu, une seule fois.
-- eval_bank_settings : l'interrupteur de la banque ; sans ligne, elle est ouverte (un cas ne naît que d'un geste).
CREATE TABLE eval_cases (
    id             BIGSERIAL    PRIMARY KEY,
    workspace_id   BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by     BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMP    NOT NULL,
    criteria_at    TIMESTAMP    NOT NULL,
    source_record  UUID         REFERENCES cortex_records(id) ON DELETE SET NULL,
    title          VARCHAR(200) NOT NULL,
    question       TEXT         NOT NULL,
    asked_on       DATE         NOT NULL,
    notes          TEXT         NOT NULL,
    cassette       TEXT         NOT NULL,
    criteria       TEXT         NOT NULL,
    archived       BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_eval_cases_workspace ON eval_cases (workspace_id, archived, created_at);

CREATE TABLE eval_runs (
    id             BIGSERIAL    PRIMARY KEY,
    workspace_id   BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    started_by     BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    started_at     TIMESTAMP    NOT NULL,
    finished_at    TIMESTAMP,
    model          VARCHAR(128) NOT NULL,
    total          INTEGER      NOT NULL,
    passed         INTEGER      NOT NULL DEFAULT 0
);

CREATE INDEX idx_eval_runs_workspace ON eval_runs (workspace_id, started_at);

CREATE TABLE eval_results (
    id             BIGSERIAL    PRIMARY KEY,
    run_id         BIGINT       NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
    case_id        BIGINT       NOT NULL REFERENCES eval_cases(id) ON DELETE CASCADE,
    passed         BOOLEAN      NOT NULL,
    details        TEXT         NOT NULL,
    created_at     TIMESTAMP    NOT NULL,
    CONSTRAINT uq_eval_results_run_case UNIQUE (run_id, case_id)
);

CREATE TABLE eval_bank_settings (
    workspace_id   BIGINT       PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    enabled        BOOLEAN      NOT NULL,
    updated_by     BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    updated_at     TIMESTAMP    NOT NULL
);
