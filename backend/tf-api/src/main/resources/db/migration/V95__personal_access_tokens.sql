-- Lot 5 (OSS-5.1) : jetons personnels, durables et révocables. Un jeton agit au nom de la personne qui l'a créé,
-- et seulement sur le serveur MCP de l'instance (Claude Code en mode interactif, autres clients MCP) : le filtre
-- PersonalTokenScopeFilter refuse tout autre chemin.
--
-- Seule l'empreinte SHA-256 du jeton est gardée (token_hash) : le jeton n'est montré qu'une fois, à la création.
-- token_hint (ses 12 premiers caractères) sert à le reconnaître dans la liste des réglages.
CREATE TABLE personal_access_tokens (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          VARCHAR(80)  NOT NULL,
    token_hash    VARCHAR(64)  NOT NULL UNIQUE,
    token_hint    VARCHAR(16)  NOT NULL,
    expires_at    TIMESTAMP,
    last_used_at  TIMESTAMP,
    revoked_at    TIMESTAMP,
    created_at    TIMESTAMP    NOT NULL,
    updated_at    TIMESTAMP    NOT NULL,
    created_by    VARCHAR(255),
    updated_by    VARCHAR(255)
);

CREATE INDEX idx_personal_access_tokens_user ON personal_access_tokens(user_id);
