-- V64 — Suppression du chat humain↔humain (canaux + messages + discussions)
--
-- Le chat temps réel n'était PAS au cahier des charges (CdCF_v2 : « Chat temps réel | Non prévu »).
-- On le retire (produit : on n'out-Slack pas Slack ; l'app intègre Slack/Teams à la place).
-- L'infra STOMP partagée (notifications, issues, workflows IA) est **conservée**.
--
-- Ordre FK-safe : on retire d'abord les colonnes miroir de slack_channels (FK → channels),
-- puis les tables de chat, puis les discussions.

ALTER TABLE slack_channels DROP COLUMN IF EXISTS mirror_channel_id;  -- ajoutée en V58 (FK → channels)
ALTER TABLE slack_channels DROP COLUMN IF EXISTS last_sync_ts;       -- ajoutée en V58

DROP TABLE IF EXISTS chat_messages;    -- FK → channels
DROP TABLE IF EXISTS channel_members;  -- FK → channels
DROP TABLE IF EXISTS channels;
DROP TABLE IF EXISTS discussions;
