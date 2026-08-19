-- V68 — Passage à 4 forfaits : FREE / BASIC / BUSINESS / ENTERPRISE (tarification par membre/mois)
--
-- `plan_type` est un VARCHAR gardé par des contraintes CHECK (cf. V6/V7, l'enum PG a été supprimé).
-- On élargit donc les 4 contraintes au nouveau jeu de valeurs, et on **migre les comptes PRO → BUSINESS**
-- (PRO était le palier payant « équipe » ; son équivalent est désormais BUSINESS). Ordre par table :
-- drop CHECK → migration des données → nouveau CHECK (sinon l'UPDATE violerait l'ancien CHECK).

-- users
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_plan_type;
UPDATE users SET plan_type = 'BUSINESS' WHERE plan_type = 'PRO';
ALTER TABLE users ADD CONSTRAINT chk_user_plan_type
    CHECK (plan_type IN ('FREE', 'BASIC', 'BUSINESS', 'ENTERPRISE'));

-- otp_verification (plan choisi pendant l'inscription)
ALTER TABLE otp_verification DROP CONSTRAINT IF EXISTS chk_otp_plan_type;
UPDATE otp_verification SET plan_type = 'BUSINESS' WHERE plan_type = 'PRO';
ALTER TABLE otp_verification ADD CONSTRAINT chk_otp_plan_type
    CHECK (plan_type IN ('FREE', 'BASIC', 'BUSINESS', 'ENTERPRISE'));

-- subscription_history
ALTER TABLE subscription_history DROP CONSTRAINT IF EXISTS chk_subscription_history_plan_type;
UPDATE subscription_history SET plan_type = 'BUSINESS' WHERE plan_type = 'PRO';
ALTER TABLE subscription_history ADD CONSTRAINT chk_subscription_history_plan_type
    CHECK (plan_type IN ('FREE', 'BASIC', 'BUSINESS', 'ENTERPRISE'));

-- subscriptions
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS chk_subscriptions_plan_type;
UPDATE subscriptions SET plan_type = 'BUSINESS' WHERE plan_type = 'PRO';
ALTER TABLE subscriptions ADD CONSTRAINT chk_subscriptions_plan_type
    CHECK (plan_type IN ('FREE', 'BASIC', 'BUSINESS', 'ENTERPRISE'));
