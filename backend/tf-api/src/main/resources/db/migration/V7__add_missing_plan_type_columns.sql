-- ===============================
-- Migration V7 : Réparer les colonnes plan_type manquantes
-- ===============================
-- Le DROP TYPE plan_type CASCADE de V6 a supprimé les colonnes plan_type
-- de subscription_history et subscriptions sans les recréer

-- Étape 1 : Ajouter la colonne plan_type à subscription_history
ALTER TABLE subscription_history 
    ADD COLUMN IF NOT EXISTS plan_type VARCHAR(20) NOT NULL DEFAULT 'FREE';

-- Étape 2 : Ajouter la colonne plan_type à subscriptions
ALTER TABLE subscriptions 
    ADD COLUMN IF NOT EXISTS plan_type VARCHAR(20) NOT NULL DEFAULT 'FREE';

-- Étape 3 : Ajouter les contraintes CHECK
ALTER TABLE subscription_history
    DROP CONSTRAINT IF EXISTS chk_subscription_history_plan_type;

ALTER TABLE subscription_history
    ADD CONSTRAINT chk_subscription_history_plan_type
    CHECK (plan_type IN ('FREE', 'PRO', 'ENTERPRISE'));

ALTER TABLE subscriptions
    DROP CONSTRAINT IF EXISTS chk_subscriptions_plan_type;

ALTER TABLE subscriptions
    ADD CONSTRAINT chk_subscriptions_plan_type
    CHECK (plan_type IN ('FREE', 'PRO', 'ENTERPRISE'));

-- Étape 4 : Commentaires
COMMENT ON COLUMN subscription_history.plan_type IS 'Type de plan au moment de l''événement (FREE, PRO, ENTERPRISE)';
COMMENT ON COLUMN subscriptions.plan_type IS 'Type de plan de l''abonnement actif (FREE, PRO, ENTERPRISE)';
