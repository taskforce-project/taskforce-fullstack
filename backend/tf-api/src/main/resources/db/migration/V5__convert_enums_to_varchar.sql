-- ===============================
-- Migration V5 : Convertir les types ENUM en VARCHAR
-- Les ENUMs PostgreSQL sont incompatibles avec Hibernate @Enumerated(STRING)
-- ===============================

-- Convertir otp_status de ENUM vers VARCHAR
ALTER TABLE otp_verification 
    ALTER COLUMN otp_status TYPE VARCHAR(20) USING otp_status::text;

-- Convertir otp_type de ENUM vers VARCHAR  
ALTER TABLE otp_verification 
    ALTER COLUMN otp_type TYPE VARCHAR(30) USING otp_type::text;

-- Ajouter des contraintes CHECK pour valider les valeurs
ALTER TABLE otp_verification
    ADD CONSTRAINT chk_otp_status 
    CHECK (otp_status IN ('PENDING', 'VERIFIED', 'EXPIRED', 'USED'));

ALTER TABLE otp_verification
    ADD CONSTRAINT chk_otp_type
    CHECK (otp_type IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'TWO_FACTOR_AUTH'));

-- Supprimer les anciens types ENUM (optionnel, peut causer des erreurs si utilisés ailleurs)
-- DROP TYPE IF EXISTS otp_status CASCADE;
-- DROP TYPE IF EXISTS otp_type CASCADE;
