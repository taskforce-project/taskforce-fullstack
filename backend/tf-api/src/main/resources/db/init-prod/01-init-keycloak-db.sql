-- ===============================
-- SCRIPT D'INITIALISATION - KEYCLOAK (PROD)
-- ===============================
-- Keycloak stocke ses realms, utilisateurs et sessions dans SA PROPRE base, distincte de la base
-- applicative. `docker-compose.prod.yml` la référence en dur :
--     KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak_prod
-- Le conteneur Postgres ne crée que la base nommée par POSTGRES_DB : sans ce script, `keycloak_prod`
-- n'existe pas et Keycloak s'arrête au démarrage.
--
-- Ce répertoire est monté sur /docker-entrypoint-initdb.d, exécuté UNE SEULE FOIS, au tout premier
-- démarrage d'un volume vide. Sur une base déjà initialisée, créer la base à la main.

SELECT 'CREATE DATABASE keycloak_prod'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak_prod')\gexec
