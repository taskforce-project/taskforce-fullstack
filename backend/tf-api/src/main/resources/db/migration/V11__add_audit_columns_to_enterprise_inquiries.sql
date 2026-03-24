-- ===============================
-- V11 - Ajout colonnes audit manquantes
-- ===============================
-- Auteur: Assistant
-- Date: 2026-03-24
-- Description: 
--   Ajoute created_by et updated_by à enterprise_inquiries
--   pour compléter l'audit héritée de AuditableEntity

-- ===============================
-- AJOUT COLONNES D'AUDIT
-- ===============================

ALTER TABLE enterprise_inquiries 
ADD COLUMN created_by VARCHAR(255),
ADD COLUMN updated_by VARCHAR(255);

-- Commentaires
COMMENT ON COLUMN enterprise_inquiries.created_by IS 'Utilisateur ayant créé l''enregistrement (audit)';
COMMENT ON COLUMN enterprise_inquiries.updated_by IS 'Utilisateur ayant modifié l''enregistrement (audit)';
