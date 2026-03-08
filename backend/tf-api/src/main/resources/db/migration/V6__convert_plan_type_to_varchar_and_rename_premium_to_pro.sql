-- ===============================
-- Migration V6 : Convertir plan_type en VARCHAR et renommer PREMIUM en PRO
-- ===============================

-- Étape 1 : Convertir plan_type de ENUM vers VARCHAR dans la table users
ALTER TABLE users 
    ALTER COLUMN plan_type TYPE VARCHAR(20) USING plan_type::text;

-- Étape 2 : Convertir plan_type dans otp_verification
ALTER TABLE otp_verification 
    ALTER COLUMN plan_type TYPE VARCHAR(20) USING plan_type::text;

-- Étape 2b : Convertir plan_type dans subscription_history
ALTER TABLE subscription_history 
    ALTER COLUMN plan_type TYPE VARCHAR(20) USING plan_type::text;

-- Étape 2c : Convertir plan_type dans subscriptions
ALTER TABLE subscriptions 
    ALTER COLUMN plan_type TYPE VARCHAR(20) USING plan_type::text;

-- Étape 3 : Renommer toutes les valeurs 'PREMIUM' en 'PRO'
UPDATE users 
SET plan_type = 'PRO' 
WHERE plan_type = 'PREMIUM';

UPDATE otp_verification 
SET plan_type = 'PRO' 
WHERE plan_type = 'PREMIUM';

UPDATE subscription_history 
SET plan_type = 'PRO' 
WHERE plan_type = 'PREMIUM';

UPDATE subscriptions 
SET plan_type = 'PRO' 
WHERE plan_type = 'PREMIUM';

-- Étape 4 : Ajouter des contraintes CHECK pour valider les valeurs
ALTER TABLE users
    ADD CONSTRAINT chk_user_plan_type 
    CHECK (plan_type IN ('FREE', 'PRO', 'ENTERPRISE'));

ALTER TABLE otp_verification
    ADD CONSTRAINT chk_otp_plan_type
    CHECK (plan_type IN ('FREE', 'PRO', 'ENTERPRISE'));

ALTER TABLE subscription_history
    ADD CONSTRAINT chk_subscription_history_plan_type
    CHECK (plan_type IN ('FREE', 'PRO', 'ENTERPRISE'));

ALTER TABLE subscriptions
    ADD CONSTRAINT chk_subscriptions_plan_type
    CHECK (plan_type IN ('FREE', 'PRO', 'ENTERPRISE'));

-- Étape 5 : Supprimer l'ancien type ENUM
DROP TYPE IF EXISTS plan_type CASCADE;

-- Commentaires mis à jour
COMMENT ON COLUMN users.plan_type IS 'Type de plan d''abonnement (FREE, PRO, ENTERPRISE)';
COMMENT ON COLUMN otp_verification.plan_type IS 'Plan sélectionné par l''utilisateur lors de l''inscription (FREE, PRO, ENTERPRISE)';
COMMENT ON COLUMN subscription_history.plan_type IS 'Type de plan au moment de l''événement (FREE, PRO, ENTERPRISE)';
COMMENT ON COLUMN subscriptions.plan_type IS 'Type de plan de l''abonnement actif (FREE, PRO, ENTERPRISE)';
