-- ===============================
-- MIGRATION V3 : Schéma complet Authentification et Abonnements
-- ===============================
-- Cette migration complète le schéma avec les tables manquantes:
-- - subscriptions (abonnements détaillés)
-- - refresh_tokens (tokens JWT)
-- - Amélioration de otp_verification pour supporter l'inscription

-- ===============================
-- 1. TABLE SUBSCRIPTIONS
-- ===============================

CREATE TABLE IF NOT EXISTS subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    plan_type plan_type NOT NULL DEFAULT 'FREE',
    status plan_status NOT NULL DEFAULT 'ACTIVE',
    stripe_subscription_id VARCHAR(100) UNIQUE,
    stripe_customer_id VARCHAR(100),
    stripe_price_id VARCHAR(100),
    amount DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'EUR',
    billing_interval VARCHAR(20),
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    trial_end TIMESTAMP,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at TIMESTAMP,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_subscription_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index pour optimiser les recherches
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end ON subscriptions(current_period_end) WHERE current_period_end IS NOT NULL;

-- Commentaires
COMMENT ON TABLE subscriptions IS 'Abonnements actifs des utilisateurs avec détails Stripe';
COMMENT ON COLUMN subscriptions.user_id IS 'Référence unique vers l''utilisateur (un seul abonnement actif par utilisateur)';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS 'Si true, l''abonnement sera annulé à la fin de la période';

-- ===============================
-- 2. TABLE REFRESH_TOKENS
-- ===============================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL,
    token VARCHAR(500) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    last_used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_refresh_token_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index pour optimiser les recherches
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Commentaires
COMMENT ON TABLE refresh_tokens IS 'Tokens de rafraîchissement JWT pour renouveler l''accès sans reconnexion';
COMMENT ON COLUMN refresh_tokens.token IS 'Token unique de rafraîchissement (UUID ou JWT)';
COMMENT ON COLUMN refresh_tokens.revoked IS 'Indique si le token a été révoqué (déconnexion, sécurité)';

-- ===============================
-- 3. MODIFICATION TABLE OTP_VERIFICATION
-- ===============================

-- Ajouter la colonne keycloak_id pour supporter l'inscription
ALTER TABLE otp_verification
    ADD COLUMN IF NOT EXISTS keycloak_id VARCHAR(100);

-- Modifier user_id pour le rendre nullable (lors de l'inscription, l'utilisateur n'existe pas encore)
ALTER TABLE otp_verification
    ALTER COLUMN user_id DROP NOT NULL;

-- Ajouter un index sur keycloak_id
CREATE INDEX IF NOT EXISTS idx_otp_keycloak_id ON otp_verification(keycloak_id) WHERE keycloak_id IS NOT NULL;

-- Commentaire
COMMENT ON COLUMN otp_verification.keycloak_id IS 'ID Keycloak de l''utilisateur (avant création dans notre DB)';
COMMENT ON COLUMN otp_verification.user_id IS 'ID utilisateur (NULL lors de l''inscription)';

-- ===============================
-- 4. TRIGGER POUR updated_at
-- ===============================

-- Appliquer le trigger sur subscriptions
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ===============================
-- 5. CONTRAINTES ET VALIDATIONS
-- ===============================

-- Validation: au moins un identifiant (user_id ou keycloak_id) doit être présent pour OTP
ALTER TABLE otp_verification
    ADD CONSTRAINT check_otp_has_identifier
    CHECK (user_id IS NOT NULL OR keycloak_id IS NOT NULL);

-- Validation: Les dates de subscription doivent être cohérentes
ALTER TABLE subscriptions
    ADD CONSTRAINT check_subscription_dates
    CHECK (
        (current_period_start IS NULL AND current_period_end IS NULL) OR
        (current_period_start IS NOT NULL AND current_period_end IS NOT NULL AND current_period_end > current_period_start)
    );

-- ===============================
-- 6. DONNÉES INITIALES (optionnel)
-- ===============================

-- Vous pouvez ajouter ici des données initiales si nécessaire
-- Par exemple, créer un utilisateur admin par défaut

-- ===============================
-- FIN DE LA MIGRATION V3
-- ===============================
