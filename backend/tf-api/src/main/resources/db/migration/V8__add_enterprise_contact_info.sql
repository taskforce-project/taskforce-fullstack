-- ===============================
-- V8 - Ajout des informations de contact pour les plans ENTERPRISE
-- ===============================
-- Auteur: Assistant
-- Date: 2026-03-22
-- Description: 
--   Ajoute les colonnes pour capturer les informations de contact
--   lorsqu'un utilisateur sélectionne le plan ENTERPRISE pendant l'inscription.
--   Ces infos permettent aux commerciaux de recontacter le client.

-- ===============================
-- 1. MODIFICATION TABLE OTP_VERIFICATION
-- ===============================

-- Ajouter colonnes pour les informations entreprise (optionnelles, sauf si plan ENTERPRISE)
ALTER TABLE otp_verification
    ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
    ADD COLUMN IF NOT EXISTS enterprise_message TEXT;

-- Index pour rechercher les demandes entreprise
CREATE INDEX IF NOT EXISTS idx_otp_company_name 
    ON otp_verification(company_name) 
    WHERE company_name IS NOT NULL;

-- Commentaires
COMMENT ON COLUMN otp_verification.company_name IS 'Nom de l''entreprise (obligatoire si planType=ENTERPRISE)';
COMMENT ON COLUMN otp_verification.phone_number IS 'Numéro de téléphone de contact (obligatoire si planType=ENTERPRISE)';
COMMENT ON COLUMN otp_verification.enterprise_message IS 'Message/besoins spécifiques pour le plan entreprise (optionnel)';
