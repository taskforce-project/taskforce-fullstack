-- V63 — Consommation de tokens IA par workspace et par mois
--
-- Source de vérité de la conso IA réelle (agent Cortex, plus tard workflows) : une ligne par
-- (workspace, mois 'YYYY-MM'), incrémentée à chaque appel LLM. Alimente le compteur « conso / quota »
-- façon Claude (popover chat + page Settings « Usage IA »). Le plafond dépend du plan (résolu côté
-- service, pas stocké ici — cf. AiUsageService.limitFor).

CREATE TABLE ai_token_usage (
    id                 BIGSERIAL   PRIMARY KEY,
    workspace_id       BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    period             VARCHAR(7)  NOT NULL,               -- 'YYYY-MM'
    prompt_tokens      BIGINT      NOT NULL DEFAULT 0,
    completion_tokens  BIGINT      NOT NULL DEFAULT 0,
    total_tokens       BIGINT      NOT NULL DEFAULT 0,
    request_count      INTEGER     NOT NULL DEFAULT 0,
    created_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by         VARCHAR(255),
    updated_by         VARCHAR(255)
);

-- Une seule ligne d'agrégat par workspace et par mois.
CREATE UNIQUE INDEX uq_ai_token_usage ON ai_token_usage (workspace_id, period);
