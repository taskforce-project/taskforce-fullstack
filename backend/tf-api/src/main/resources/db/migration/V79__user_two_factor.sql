-- ============================================================
-- V79 -- 2FA (TOTP) géré par l'application
-- ============================================================
-- Le secret TOTP vit ICI (plus dans Keycloak) : génération + QR + vérification côté app,
-- imposé au login (le backend confidentiel est le SEUL chemin d'auth → l'imposer là suffit).
-- Une ligne par utilisateur :
--   * enabled = false : secret généré, en attente de confirmation (scan du QR + 1er code)
--   * enabled = true  : confirmé → un code TOTP est exigé à chaque connexion
CREATE TABLE user_two_factor (
    id           BIGSERIAL   PRIMARY KEY,
    user_id      BIGINT      NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    secret       VARCHAR(64) NOT NULL,
    enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP   NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMP
);

CREATE INDEX idx_user_two_factor_user ON user_two_factor(user_id);
