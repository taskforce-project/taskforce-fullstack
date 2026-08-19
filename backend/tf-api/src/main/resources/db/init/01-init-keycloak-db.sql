-- ===============================
-- SCRIPT D'INITIALISATION - KEYCLOAK
-- ===============================
-- Création de la base de données pour Keycloak en développement

-- Connexion à la base postgres par défaut pour créer la DB keycloak_dev
SELECT 'CREATE DATABASE keycloak_dev'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak_dev')\gexec

-- Optionnel : Grant des permissions
-- \c keycloak_dev
-- GRANT ALL PRIVILEGES ON DATABASE keycloak_dev TO postgres;
