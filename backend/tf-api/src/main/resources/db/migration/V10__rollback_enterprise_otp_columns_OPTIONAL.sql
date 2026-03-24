-- ===============================
-- V10 - Rollback colonnes ENTERPRISE inutiles (OPTIONNEL)
-- ===============================
-- Auteur: Assistant
-- Date: 2026-03-23
-- Description: 
--   Les colonnes company_name, phone_number, enterprise_message dans otp_verification
--   ne sont plus utilisées depuis le passage au système enterprise_inquiries.
--   Cette migration permet de les supprimer si on veut nettoyer la DB.
--
-- ⚠️ ATTENTION : Cette migration est OPTIONNELLE et peut être reportée.
-- Les colonnes existantes ne causent pas de problèmes fonctionnels.

-- ===============================
-- Commande pour rollback V8 (à exécuter manuellement si nécessaire)
-- ===============================

-- ALTER TABLE otp_verification DROP COLUMN IF EXISTS company_name;
-- ALTER TABLE otp_verification DROP COLUMN IF EXISTS phone_number;
-- ALTER TABLE otp_verification DROP COLUMN IF EXISTS enterprise_message;
-- DROP INDEX IF EXISTS idx_otp_company_name;

-- ===============================
-- NOTE: Cette migration est commentée par défaut
-- ===============================
-- Décommenter les lignes ci-dessus si vous voulez supprimer ces colonnes.
-- Sinon, elles peuvent rester (pas d'impact sur les performances).
