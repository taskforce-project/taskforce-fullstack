-- V57 — États OAuth éphémères pour les intégrations (GitHub / Slack)
-- Dépend de : V13 (workspaces), V1 (users), V30 (integrations)
--
-- Objectif : sécuriser le flux OAuth « Connect ». Au clic sur Connect, le back génère
-- un `state` aléatoire (anti-CSRF) lié au workspace + à l'utilisateur, le stocke ici, et
-- le renvoie dans l'URL d'autorisation. Au callback, on résout le workspace via ce `state`
-- (au lieu de faire confiance à un slug devinable dans l'URL), puis on le supprime.

CREATE TABLE oauth_states (
    state         VARCHAR(64)  PRIMARY KEY,          -- token aléatoire URL-safe
    provider      VARCHAR(32)  NOT NULL,             -- GITHUB | SLACK
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id       BIGINT       REFERENCES users(id)  ON DELETE SET NULL,  -- qui a initié
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMP    NOT NULL              -- typiquement now() + 10 min
);

-- Purge des states expirés (balayage périodique / opportuniste)
CREATE INDEX idx_oauth_states_expires_at ON oauth_states(expires_at);
