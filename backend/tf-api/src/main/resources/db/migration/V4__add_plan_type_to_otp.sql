-- V4__add_plan_type_to_otp.sql
-- Ajout de la colonne plan_type à la table otp_verification pour stocker temporairement
-- le plan sélectionné par l'utilisateur pendant le processus d'inscription en 3 étapes

ALTER TABLE otp_verification
ADD COLUMN plan_type VARCHAR(20);

COMMENT ON COLUMN otp_verification.plan_type IS 'Plan sélectionné par l''utilisateur lors de l''inscription (FREE, PRO, PREMIUM, ENTERPRISE)';
