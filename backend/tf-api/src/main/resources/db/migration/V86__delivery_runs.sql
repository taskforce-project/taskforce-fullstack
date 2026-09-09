-- Run de delegation a un agent de livraison (TF-AGENT-DELIVERY slice 3). Trace durable d'une tache
-- deleguee : quel provider, quel modele, quel statut, quel resultat (resume + lien PR/doc/...). Le
-- pipeline dispatch->poll->resultat est prouve d'abord par un provider "stub" (available) ; les vrais
-- providers (Claude Code via Managed Agents, Copilot, Cursor) branchent leur dispatch ensuite.
CREATE TABLE delivery_runs (
    id            BIGSERIAL PRIMARY KEY,
    issue_id      BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    provider_key  VARCHAR(40)  NOT NULL,
    model         VARCHAR(80),
    status        VARCHAR(16)  NOT NULL DEFAULT 'QUEUED',
    external_ref  VARCHAR(200),
    summary       TEXT,
    result_url    VARCHAR(1000),
    error         TEXT,
    started_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMP    NOT NULL,
    updated_at    TIMESTAMP    NOT NULL,
    created_by    VARCHAR(255),
    updated_by    VARCHAR(255)
);

CREATE INDEX idx_delivery_runs_issue ON delivery_runs(issue_id);
