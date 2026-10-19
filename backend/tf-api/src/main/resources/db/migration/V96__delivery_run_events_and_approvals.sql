-- Lot 5 (OSS-5.3, OSS-5.4) : suivi en direct d'un run du runner local et validations dans l'app.
--
-- delivery_run_events : chronologie compacte d'un run, relayée par le runner depuis la sortie stream-json de
-- Claude Code (démarrage, texte, appel d'outil, échec, refus). Texte borné, 500 événements au plus par run.
--
-- delivery_run_approvals : une action de l'agent hors du socle pré-autorisé attend la décision de la personne qui a
-- délégué (c'est sa machine qui l'exécute). Sans réponse avant expires_at, la demande expire et l'action est refusée.
CREATE TABLE delivery_run_events (
    id          BIGSERIAL PRIMARY KEY,
    run_id      BIGINT        NOT NULL REFERENCES delivery_runs(id) ON DELETE CASCADE,
    seq         INTEGER       NOT NULL,
    kind        VARCHAR(16)   NOT NULL,
    tool        VARCHAR(120),
    text        VARCHAR(2000) NOT NULL,
    created_at  TIMESTAMP     NOT NULL,
    updated_at  TIMESTAMP     NOT NULL,
    created_by  VARCHAR(255),
    updated_by  VARCHAR(255),
    CONSTRAINT uq_delivery_run_events_seq UNIQUE (run_id, seq)
);

CREATE TABLE delivery_run_approvals (
    id          BIGSERIAL PRIMARY KEY,
    run_id      BIGINT        NOT NULL REFERENCES delivery_runs(id) ON DELETE CASCADE,
    tool        VARCHAR(120)  NOT NULL,
    summary     VARCHAR(2000) NOT NULL,
    status      VARCHAR(16)   NOT NULL DEFAULT 'PENDING',
    expires_at  TIMESTAMP     NOT NULL,
    decided_by  BIGINT        REFERENCES users(id) ON DELETE SET NULL,
    decided_at  TIMESTAMP,
    created_at  TIMESTAMP     NOT NULL,
    updated_at  TIMESTAMP     NOT NULL,
    created_by  VARCHAR(255),
    updated_by  VARCHAR(255)
);

CREATE INDEX idx_delivery_run_approvals_run ON delivery_run_approvals(run_id);
