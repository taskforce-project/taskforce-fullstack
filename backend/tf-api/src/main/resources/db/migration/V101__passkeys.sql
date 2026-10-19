-- Passkeys (WebAuthn) : connexion sans mot de passe, vérifiée par Spring Security au-dessus de webauthn4j
-- (PasskeyService). passkey_handle est l'identifiant WebAuthn de la personne (« user handle »), tiré au hasard à sa
-- première passkey : il ne révèle rien d'elle et ne change pas avec son adresse. user_credentials est la table que lit
-- et écrit JdbcUserCredentialRepository de Spring Security (noms de colonnes imposés) : une ligne par passkey, sa clé
-- publique et son compteur, jamais de secret.
ALTER TABLE users ADD COLUMN passkey_handle VARCHAR(128) UNIQUE;

CREATE TABLE user_credentials (
    credential_id                VARCHAR(1000) NOT NULL PRIMARY KEY,
    user_entity_user_id          VARCHAR(128)  NOT NULL REFERENCES users(passkey_handle) ON DELETE CASCADE,
    public_key                   BYTEA         NOT NULL,
    signature_count              BIGINT,
    uv_initialized               BOOLEAN,
    backup_eligible              BOOLEAN       NOT NULL,
    authenticator_transports     VARCHAR(1000),
    public_key_credential_type   VARCHAR(100),
    backup_state                 BOOLEAN       NOT NULL,
    attestation_object           BYTEA,
    attestation_client_data_json BYTEA,
    created                      TIMESTAMP,
    last_used                    TIMESTAMP,
    label                        VARCHAR(1000) NOT NULL
);

CREATE INDEX idx_user_credentials_user ON user_credentials(user_entity_user_id);
