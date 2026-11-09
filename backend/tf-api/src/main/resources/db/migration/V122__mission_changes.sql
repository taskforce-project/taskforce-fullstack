-- R139 et R140 (séance n°20, TF-J1-17) : les changements d'une mission sous les yeux, un fichier remis comme avant, un
-- commentaire sur une ligne qui repart à l'agent.
--
-- Une mission garde d'où elle part (le commit d'avant), sa session d'agent et, pour une reprise, la mission qu'elle
-- continue et les commentaires qui la lancent. Ce que le runner relève fichier par fichier vit dans sa table, remplacée
-- à chaque relevé. Les ordres donnés au runner (remettre un fichier, passer une correction) vivent dans la leur : le
-- backend ne joint pas un poste local, c'est le runner qui vient les chercher.

ALTER TABLE delivery_runs
    ADD COLUMN parent_run_id BIGINT REFERENCES delivery_runs(id) ON DELETE SET NULL,
    ADD COLUMN base_sha      VARCHAR(64),
    ADD COLUMN agent_session VARCHAR(64),
    ADD COLUMN work_mode     VARCHAR(8),
    ADD COLUMN changes_more  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN branch_gone   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN tests_stale   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN follow_up     JSONB;

CREATE TABLE delivery_run_changes (
    id          BIGSERIAL PRIMARY KEY,
    run_id      BIGINT NOT NULL REFERENCES delivery_runs(id) ON DELETE CASCADE,
    path        VARCHAR(1024) NOT NULL,
    status      VARCHAR(16) NOT NULL,
    added       INTEGER,
    removed     INTEGER,
    is_binary   BOOLEAN NOT NULL DEFAULT FALSE,
    truncated   BOOLEAN NOT NULL DEFAULT FALSE,
    withheld    BOOLEAN NOT NULL DEFAULT FALSE,
    revision    VARCHAR(64) NOT NULL,
    body        TEXT,
    updated_at  TIMESTAMP NOT NULL
);
CREATE INDEX idx_delivery_run_changes_run ON delivery_run_changes(run_id);

CREATE TABLE delivery_run_commands (
    id           BIGSERIAL PRIMARY KEY,
    run_id       BIGINT NOT NULL REFERENCES delivery_runs(id) ON DELETE CASCADE,
    kind         VARCHAR(16) NOT NULL,
    path         VARCHAR(1024),
    text         VARCHAR(2000),
    status       VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    message      VARCHAR(1000),
    requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMP NOT NULL,
    taken_at     TIMESTAMP,
    ended_at     TIMESTAMP
);
CREATE INDEX idx_delivery_run_commands_run ON delivery_run_commands(run_id);

-- « Pierre asked for changes » : le geste entre à l'activité de l'issue, comme les autres gestes de la carte de résultat.
ALTER TYPE issue_activity_type ADD VALUE IF NOT EXISTS 'MISSION_CHANGES_ASKED';
