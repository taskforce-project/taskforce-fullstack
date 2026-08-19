-- ===============================
-- V9 - Création table enterprise_inquiries
-- ===============================
-- Auteur: Assistant
-- Date: 2026-03-23
-- Description: 
--   Crée une table dédiée pour les demandes de contact ENTERPRISE.
--   Séparée du flow d'inscription classique (plus propre).

-- ===============================
-- 1. TABLE ENTERPRISE_INQUIRIES
-- ===============================

CREATE TABLE enterprise_inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    team_size VARCHAR(50) NOT NULL, -- '1-10', '11-50', '51-200', '200+'
    message TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW', -- NEW, CONTACTED, QUALIFIED, CONVERTED, REJECTED
    created_account BOOLEAN DEFAULT FALSE, -- TRUE si l'utilisateur a créé un compte FREE en attendant
    user_id BIGINT, -- ID utilisateur si compte créé
    assigned_to VARCHAR(100), -- ID du commercial assigné
    notes TEXT, -- Notes internes de l'équipe sales
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    contacted_at TIMESTAMP, -- Date du premier contact
    converted_at TIMESTAMP -- Date de conversion en client ENTERPRISE
);

-- Index pour recherche
CREATE INDEX idx_enterprise_inquiries_email ON enterprise_inquiries(email);
CREATE INDEX idx_enterprise_inquiries_status ON enterprise_inquiries(status);
CREATE INDEX idx_enterprise_inquiries_user_id ON enterprise_inquiries(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_enterprise_inquiries_created_at ON enterprise_inquiries(created_at DESC);

-- Commentaires
COMMENT ON TABLE enterprise_inquiries IS 'Demandes de contact pour les plans ENTERPRISE';
COMMENT ON COLUMN enterprise_inquiries.team_size IS 'Taille de l''équipe (1-10, 11-50, 51-200, 200+)';
COMMENT ON COLUMN enterprise_inquiries.status IS 'Statut du lead: NEW, CONTACTED, QUALIFIED, CONVERTED, REJECTED';
COMMENT ON COLUMN enterprise_inquiries.created_account IS 'Indique si l''utilisateur a créé un compte FREE en attendant';
COMMENT ON COLUMN enterprise_inquiries.user_id IS 'Si un compte a été créé, lien vers users.id';
COMMENT ON COLUMN enterprise_inquiries.assigned_to IS 'Commercial assigné (Keycloak ID ou email)';

-- Trigger pour updated_at
CREATE TRIGGER update_enterprise_inquiries_updated_at
    BEFORE UPDATE ON enterprise_inquiries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ===============================
-- 2. AJOUTER FLAG DANS USERS
-- ===============================

-- Ajouter flag pour indiquer qu'un utilisateur FREE a un intérêt ENTERPRISE
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS enterprise_interest BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN users.enterprise_interest IS 'TRUE si l''utilisateur a manifesté un intérêt pour ENTERPRISE';
