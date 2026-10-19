-- App desktop : sessions ouvertes par la connexion dans la webapp (page /auth/desktop, retour sur 127.0.0.1 avec PKCE,
-- cf. DesktopSessionService). Une session vaut un jeton durable (tfa_...) gardé chiffré par l'app ; seule son empreinte
-- SHA-256 est stockée ici. Elle relit le compte au lancement de l'app, se prolonge à chaque usage et se révoque à la
-- déconnexion de l'app ou depuis les réglages de la webapp.
CREATE TABLE desktop_sessions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          VARCHAR(80)  NOT NULL,
    token_hash    VARCHAR(64)  NOT NULL UNIQUE,
    expires_at    TIMESTAMP    NOT NULL,
    last_used_at  TIMESTAMP,
    revoked_at    TIMESTAMP,
    created_at    TIMESTAMP    NOT NULL,
    updated_at    TIMESTAMP    NOT NULL,
    created_by    VARCHAR(255),
    updated_by    VARCHAR(255)
);

CREATE INDEX idx_desktop_sessions_user ON desktop_sessions(user_id);
