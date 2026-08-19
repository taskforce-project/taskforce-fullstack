-- ===============================
-- MIGRATION V2 : Authentification et Abonnements
-- ===============================

-- ===============================
-- 1. TYPES ENUM
-- ===============================

-- Type de plan
CREATE TYPE plan_type AS ENUM ('FREE', 'PREMIUM', 'ENTERPRISE');

-- Statut du plan
CREATE TYPE plan_status AS ENUM ('ACTIVE', 'CANCELED', 'PAST_DUE', 'TRIALING', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'UNPAID');

-- Type d'OTP
CREATE TYPE otp_type AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'TWO_FACTOR_AUTH');

-- Statut OTP
CREATE TYPE otp_status AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'USED');

-- ===============================
-- 2. MODIFICATION TABLE USERS
-- ===============================

-- Ajouter les colonnes pour la gestion des abonnements
ALTER TABLE users
    ADD COLUMN plan_type plan_type NOT NULL DEFAULT 'FREE',
    ADD COLUMN plan_status plan_status DEFAULT NULL,
    ADD COLUMN stripe_customer_id VARCHAR(255) UNIQUE,
    ADD COLUMN stripe_subscription_id VARCHAR(255) UNIQUE,
    ADD COLUMN subscription_start_date TIMESTAMP,
    ADD COLUMN subscription_end_date TIMESTAMP,
    ADD COLUMN trial_end_date TIMESTAMP;

-- Supprimer les colonnes first_name et last_name (gérées par Keycloak)
ALTER TABLE users
    DROP COLUMN IF EXISTS first_name,
    DROP COLUMN IF EXISTS last_name;

-- Ajouter un index sur stripe_customer_id
CREATE INDEX idx_users_stripe_customer_id ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ===============================
-- 3. TABLE OTP_VERIFICATION
-- ===============================

CREATE TABLE otp_verification (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    otp_type otp_type NOT NULL,
    otp_status otp_status NOT NULL DEFAULT 'PENDING',
    email VARCHAR(255) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    expires_at TIMESTAMP NOT NULL,
    verified_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index pour optimiser les recherches
CREATE INDEX idx_otp_user_id ON otp_verification(user_id);
CREATE INDEX idx_otp_email ON otp_verification(email);
CREATE INDEX idx_otp_code ON otp_verification(otp_code);
CREATE INDEX idx_otp_status ON otp_verification(otp_status);
CREATE INDEX idx_otp_expires_at ON otp_verification(expires_at);

-- ===============================
-- 4. TABLE SUBSCRIPTION_HISTORY
-- ===============================

CREATE TABLE subscription_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL,
    plan_type plan_type NOT NULL,
    plan_status plan_status NOT NULL,
    stripe_subscription_id VARCHAR(255),
    stripe_invoice_id VARCHAR(255),
    amount_paid DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'EUR',
    period_start TIMESTAMP,
    period_end TIMESTAMP,
    event_type VARCHAR(100) NOT NULL, -- subscription.created, subscription.updated, etc.
    event_data JSONB, -- Données complètes de l'événement Stripe
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_subscription_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index pour optimiser les recherches
CREATE INDEX idx_subscription_history_user_id ON subscription_history(user_id);
CREATE INDEX idx_subscription_history_created_at ON subscription_history(created_at DESC);
CREATE INDEX idx_subscription_history_event_type ON subscription_history(event_type);

-- ===============================
-- 5. COMMENTAIRES (Documentation)
-- ===============================

COMMENT ON TABLE users IS 'Table des utilisateurs avec intégration Keycloak et Stripe';
COMMENT ON COLUMN users.keycloak_id IS 'ID de l''utilisateur dans Keycloak (source of truth pour l''authentification)';
COMMENT ON COLUMN users.plan_type IS 'Type d''abonnement actuel de l''utilisateur';
COMMENT ON COLUMN users.plan_status IS 'Statut de l''abonnement Stripe';
COMMENT ON COLUMN users.stripe_customer_id IS 'ID du client dans Stripe';
COMMENT ON COLUMN users.stripe_subscription_id IS 'ID de l''abonnement actif dans Stripe';

COMMENT ON TABLE otp_verification IS 'Codes OTP pour vérification email et réinitialisation mot de passe';
COMMENT ON COLUMN otp_verification.otp_code IS 'Code à 6 chiffres envoyé par email';
COMMENT ON COLUMN otp_verification.attempts IS 'Nombre de tentatives de validation';
COMMENT ON COLUMN otp_verification.max_attempts IS 'Nombre maximum de tentatives autorisées';

COMMENT ON TABLE subscription_history IS 'Historique de tous les événements liés aux abonnements';
COMMENT ON COLUMN subscription_history.event_data IS 'Données JSON complètes de l''événement Stripe webhook';

-- ===============================
-- 6. FONCTION DE MISE À JOUR AUTOMATIQUE DE updated_at
-- ===============================

-- Fonction trigger pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer le trigger sur otp_verification
CREATE TRIGGER update_otp_verification_updated_at
    BEFORE UPDATE ON otp_verification
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
