-- ============================================================
-- V81 -- ai_generations : couche de capture du data flywheel (HITL)
-- ============================================================
-- A chaque point human-in-the-loop ou l'IA propose et l'humain tranche (spec d'issue,
-- priorite OODA -> issue, smart-assign), on capture le contexte Brain OS servi, le draft
-- propose, le final retenu et le signal (accepte / edite / rejete). Corpus de preferences
-- PAR WORKSPACE (jamais cross-tenant) : observabilite aujourd'hui, carburant d'un LoRA/DPO
-- plus tard. Voir taskforce-docs/v1/road_to_v2/Data_Flywheel_et_Apprentissage.md
--
-- Extensible V2 : `kind` est un VARCHAR (aucune contrainte CHECK) et `final` est du JSONB, donc
-- accueillir un futur kind (ex. EXECUTION) ou un outcome d'execution ne demande pas de migration.
-- Opt-in RGPD : la capture est court-circuitee si workspaces.ai_learning_enabled = false.

CREATE TABLE ai_generations (
    id             BIGSERIAL    PRIMARY KEY,
    workspace_id   BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    kind           VARCHAR(32)  NOT NULL,              -- SPEC | DECISION | SMART_ASSIGN (extensible, valide cote appli)
    request_ref    VARCHAR(128),                       -- objet vise (cle d'issue, id de priorite...)
    context_refs   JSONB        NOT NULL DEFAULT '[]', -- ids des nodes Brain OS servis (RAG)
    draft          JSONB        NOT NULL DEFAULT '{}', -- ce que l'IA a propose
    final          JSONB,                              -- ce que l'humain a retenu (null tant que non tranche)
    signal         VARCHAR(16),                        -- ACCEPTED | EDITED | REJECTED (null tant que non tranche)
    edit_distance  INT,                                -- Levenshtein(draft, final) pour les kinds texte ; null sinon
    model          VARCHAR(64),
    latency_ms     INT,
    created_by     VARCHAR(255),                       -- AuditableEntity : id de l'utilisateur declencheur
    updated_by     VARCHAR(255),                       -- AuditableEntity
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ai_generations_signal CHECK (signal IS NULL OR signal IN ('ACCEPTED', 'EDITED', 'REJECTED'))
);

-- Lecture principale : le corpus d'un workspace par type, du plus recent au plus ancien.
CREATE INDEX idx_ai_generations_ws_kind_created ON ai_generations(workspace_id, kind, created_at DESC);
-- Finalisation : retrouver vite la derniere ligne OUVERTE (final null) d'un objet.
CREATE INDEX idx_ai_generations_open ON ai_generations(workspace_id, kind, request_ref) WHERE final IS NULL;

-- Flag opt-in RGPD, par workspace (defaut OFF : rien n'est capture tant que le workspace ne l'active pas).
ALTER TABLE workspaces ADD COLUMN ai_learning_enabled BOOLEAN NOT NULL DEFAULT false;
