-- ===============================
-- INITIALISATION PRODUCTION - UMAMI (mesure d'audience)
-- ===============================
-- Base dédiée à l'outil de mesure d'audience de la landing page (CERT-C20).
--
-- Umami est auto-hébergé et ne dépose aucun cookie. C'est un choix de conformité, pas de
-- confort : le registre des traitements reste sans destinataire hors UE, et aucun recueil de
-- consentement supplémentaire n'est nécessaire.
--
-- ATTENTION : ce script ne s'exécute QU'À LA PREMIÈRE création du volume PostgreSQL. Sur une
-- installation déjà en service, créer la base à la main :
--   docker compose -f docker-compose.prod.yml exec postgres \
--     psql -U "$POSTGRES_USER" -c "CREATE DATABASE umami"

SELECT 'CREATE DATABASE umami'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'umami')\gexec
