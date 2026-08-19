-- V65 — Conversations Cortex (multi-conversation + historique + mémoire multi-tours)
--
-- Chaque utilisateur peut avoir plusieurs conversations avec Cortex, persistées (survivent au reload),
-- listables, supprimables. Les messages alimentent la mémoire (historique injecté dans le prompt) et
-- la jauge de contexte (empreinte tokens réelle de la conversation).

CREATE TABLE ai_conversation (
    id            BIGSERIAL    PRIMARY KEY,
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         VARCHAR(200) NOT NULL DEFAULT 'Nouvelle conversation',
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by    VARCHAR(255),
    updated_by    VARCHAR(255)
);
CREATE INDEX idx_ai_conversation_ws_user ON ai_conversation (workspace_id, user_id, updated_at DESC);

CREATE TABLE ai_message (
    id               BIGSERIAL   PRIMARY KEY,
    conversation_id  BIGINT      NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
    role             VARCHAR(16) NOT NULL,               -- 'user' | 'assistant'
    content          TEXT        NOT NULL,
    mode             VARCHAR(16),                        -- fast | deep | fallback (côté assistant)
    total_tokens     BIGINT      NOT NULL DEFAULT 0,
    created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ai_message_conversation ON ai_message (conversation_id, created_at);
