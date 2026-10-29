-- Le noyau pour Cortex (séance n°7 du Conseil, R35) : chaque outil que Cortex veut lancer est jugé
-- par les règles de l'espace, et chaque décision entre dans un dossier chaîné, au format des missions (V103,
-- contracts/evidence). Une réponse de Cortex qui appelle un outil est une mission de l'agent interne.
--
-- cortex_records : un dossier par réponse de Cortex qui a appelé un outil. root = l'empreinte du dernier événement,
-- tenue à jour à chaque ajout : un accord donné après la réponse prolonge le même dossier.
-- cortex_record_events : ses événements, ajoutés et jamais modifiés, chaînés comme ceux de delivery_run_evidence.
CREATE TABLE cortex_records (
    id            UUID         PRIMARY KEY,
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TIMESTAMP    NOT NULL,
    root          VARCHAR(71)
);

CREATE INDEX idx_cortex_records_workspace_user ON cortex_records (workspace_id, user_id, created_at);

CREATE TABLE cortex_record_events (
    id          BIGSERIAL    PRIMARY KEY,
    record_id   UUID         NOT NULL REFERENCES cortex_records(id) ON DELETE CASCADE,
    seq         INTEGER      NOT NULL,
    at          VARCHAR(32)  NOT NULL,
    type        VARCHAR(32)  NOT NULL,
    actor_kind  VARCHAR(16)  NOT NULL,
    actor_id    VARCHAR(255) NOT NULL,
    data        TEXT         NOT NULL,
    prev        VARCHAR(71)  NOT NULL,
    hash        VARCHAR(71)  NOT NULL,
    CONSTRAINT uq_cortex_record_events_seq UNIQUE (record_id, seq)
);
