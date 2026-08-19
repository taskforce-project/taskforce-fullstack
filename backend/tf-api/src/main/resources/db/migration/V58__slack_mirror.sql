-- V58 — Miroir Slack → chat TaskForce (import des messages Slack dans un canal de chat)
-- Dépend de : V30 (slack_channels), et de la table chat_messages / channels (module chat)

-- ============================================================
-- chat_messages : support des messages importés d'une source externe (Slack)
-- author_id reste NULL pour un message externe ; l'expéditeur est décrit par external_author.
-- ============================================================
ALTER TABLE chat_messages
    ADD COLUMN external_source VARCHAR(16),   -- NULL = natif ; 'SLACK' = importé
    ADD COLUMN external_id     VARCHAR(64),   -- identifiant source (ts Slack) pour la déduplication
    ADD COLUMN external_author VARCHAR(200);  -- nom affiché de l'expéditeur côté source

-- Déduplication : un message externe n'est importé qu'une fois par canal
CREATE UNIQUE INDEX uq_chat_messages_external
    ON chat_messages (channel_id, external_id)
    WHERE external_id IS NOT NULL;

-- ============================================================
-- slack_channels : lien vers le canal de chat TaskForce miroir + curseur de sync
-- ============================================================
ALTER TABLE slack_channels
    ADD COLUMN mirror_channel_id BIGINT REFERENCES channels(id) ON DELETE SET NULL,
    ADD COLUMN last_sync_ts      VARCHAR(32);  -- dernier ts Slack synchronisé (curseur conversations.history)
