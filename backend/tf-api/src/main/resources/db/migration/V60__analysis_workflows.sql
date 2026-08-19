-- V60 — Workflows d'analyse IA asynchrones + décisions persistées et actionnables
--
-- Jusqu'ici la décision (boucle OODA) était calculée à la volée et perdue à la fermeture de l'onglet.
-- On persiste désormais : le workflow (analysis_job, avec son plan d'étapes joué en direct), le brief
-- qu'il produit (decision_brief), et chaque priorité (decision_priority) — actionnable et traçable
-- jusqu'à l'issue créée. Dépend de : workspaces, projects, users, issues.

-- ============================================================
-- decision_brief : la « décision du jour » d'un projet, persistée.
-- snapshot_* = les métriques observées au moment de l'analyse (transparence : on sait sur quels
-- chiffres le modèle a raisonné, même si le projet a bougé depuis).
-- ============================================================
CREATE TABLE decision_brief (
    id                  BIGSERIAL PRIMARY KEY,
    workspace_id        BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id          BIGINT      NOT NULL REFERENCES projects(id)   ON DELETE CASCADE,
    situation           TEXT        NOT NULL DEFAULT '',
    risks_json          TEXT        NOT NULL DEFAULT '[]',  -- array JSON de strings
    snapshot_total      BIGINT      NOT NULL DEFAULT 0,
    snapshot_open       BIGINT      NOT NULL DEFAULT 0,
    snapshot_in_progress BIGINT     NOT NULL DEFAULT 0,
    snapshot_completed  BIGINT      NOT NULL DEFAULT 0,
    snapshot_overdue    BIGINT      NOT NULL DEFAULT 0,
    snapshot_due_soon   BIGINT      NOT NULL DEFAULT 0,
    mode                VARCHAR(16) NOT NULL DEFAULT 'generated',  -- generated | fallback
    created_at          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          VARCHAR(255),
    updated_by          VARCHAR(255)
);

-- Le dernier brief d'un projet est lu à chaque ouverture de la page Analytics.
CREATE INDEX idx_decision_brief_project ON decision_brief (project_id, created_at DESC);

-- ============================================================
-- decision_priority : une action recommandée, actionnable.
-- status NEW → ACCEPTED (issue créée) | PINNED | DISMISSED. issue_id trace le lien décision → exécution.
-- ============================================================
CREATE TABLE decision_priority (
    id          BIGSERIAL PRIMARY KEY,
    brief_id    BIGINT       NOT NULL REFERENCES decision_brief(id) ON DELETE CASCADE,
    level       VARCHAR(8)   NOT NULL DEFAULT 'MEDIUM',  -- HIGH | MEDIUM | LOW
    title       VARCHAR(500) NOT NULL,
    rationale   TEXT         NOT NULL DEFAULT '',
    status      VARCHAR(16)  NOT NULL DEFAULT 'NEW',     -- NEW | ACCEPTED | PINNED | DISMISSED
    issue_id    BIGINT       REFERENCES issues(id) ON DELETE SET NULL,
    position    INT          NOT NULL DEFAULT 0,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by  VARCHAR(255),
    updated_by  VARCHAR(255)
);

CREATE INDEX idx_decision_priority_brief ON decision_priority (brief_id, position);

-- ============================================================
-- analysis_job : le workflow qui produit un brief, exécuté en arrière-plan (@Async).
-- plan_json = les étapes (agent-plan) mises à jour en direct et poussées en STOMP.
-- question/answer = boucle HITL : le modèle peut demander une clarification (status
-- WAITING_FOR_INPUT) et reprend une fois l'humain répondu.
-- ============================================================
CREATE TABLE analysis_job (
    id           BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id   BIGINT      NOT NULL REFERENCES projects(id)   ON DELETE CASCADE,
    user_id      BIGINT      REFERENCES users(id) ON DELETE SET NULL,  -- qui a lancé l'analyse
    depth        VARCHAR(8)  NOT NULL DEFAULT 'QUICK',   -- QUICK | DEEP
    status       VARCHAR(24) NOT NULL DEFAULT 'QUEUED',  -- QUEUED | RUNNING | WAITING_FOR_INPUT | DONE | FAILED
    plan_json    TEXT        NOT NULL DEFAULT '[]',      -- array JSON d'étapes (agent-plan)
    question     TEXT,                                   -- HITL : question du modèle
    answer       TEXT,                                   -- HITL : réponse de l'humain
    error        TEXT,                                   -- message d'échec (status = FAILED)
    brief_id     BIGINT      REFERENCES decision_brief(id) ON DELETE SET NULL,
    dismissed    BOOLEAN     NOT NULL DEFAULT FALSE,     -- retiré du dock (soft delete : on garde la trace)
    created_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by   VARCHAR(255),
    updated_by   VARCHAR(255)
);

-- Le dock liste les workflows récents non masqués du workspace.
CREATE INDEX idx_analysis_job_workspace ON analysis_job (workspace_id, created_at DESC)
    WHERE dismissed = FALSE;
