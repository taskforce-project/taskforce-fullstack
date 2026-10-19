-- ============================================================
-- V98 -- webhooks sortants reellement envoyes : file d'envoi, signature, nouvelles tentatives (OSS-6.2, ADR-020)
-- ============================================================
-- Jusqu'ici, l'ecran des webhooks enregistrait des URL mais rien n'etait jamais envoye, ni signe.
--
-- webhook_deliveries : un envoi par webhook abonne et par evenement. La ligne est ecrite dans la meme
-- transaction que le changement qui la provoque (issue creee, commentaire...) : pas d'envoi pour un
-- changement annule, pas de changement sans envoi. Un planificateur l'envoie ensuite, hors transaction,
-- et la retente avec un delai croissant jusqu'a reussite ou abandon.
--
-- webhooks.secret passe en TEXT : le secret de signature est desormais genere par l'instance et chiffre au
-- repos (EncryptedStringConverter), ce qui allonge la valeur stockee. Une valeur claire existante reste lue
-- telle quelle et sera chiffree a la prochaine sauvegarde.

ALTER TABLE webhooks ALTER COLUMN secret TYPE TEXT;

CREATE TABLE webhook_deliveries (
    id              BIGSERIAL    PRIMARY KEY,
    webhook_id      BIGINT       NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    delivery_id     UUID         NOT NULL UNIQUE,      -- en-tete X-TaskForce-Delivery, stable entre les tentatives
    event_type      VARCHAR(64)  NOT NULL,             -- ex. issue.created, ping
    payload         TEXT         NOT NULL,             -- corps JSON envoye (signe tel quel)
    status          VARCHAR(16)  NOT NULL DEFAULT 'PENDING',  -- PENDING | DELIVERED | FAILED
    attempts        INTEGER      NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    last_status     INTEGER,                            -- code HTTP de la derniere tentative (null = pas de reponse)
    last_error      VARCHAR(500),
    delivered_at    TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(255),
    updated_by      VARCHAR(255)
);

-- Le planificateur ne lit que les envois dus.
CREATE INDEX idx_webhook_deliveries_due ON webhook_deliveries (next_attempt_at) WHERE status = 'PENDING';
-- Historique recent d'un webhook (ecran des webhooks) et purge de retention.
CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_id, created_at DESC);
