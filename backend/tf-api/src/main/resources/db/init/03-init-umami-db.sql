-- ===============================
-- SCRIPT D'INITIALISATION - UMAMI (mesure d'audience)
-- ===============================
-- Base dédiée à l'outil de mesure d'audience de la landing page.
--
-- Umami est retenu plutôt qu'une solution hébergée à l'étranger parce qu'il est
-- auto-hébergeable et ne dépose aucun cookie : le registre des traitements reste sans
-- transfert hors UE, et aucun consentement supplémentaire n'est requis.
--
-- ATTENTION : les scripts de ce répertoire ne s'exécutent QU'À LA PREMIÈRE création du
-- volume Postgres. Sur une installation existante, créer la base à la main :
--   docker exec -it taskforce-postgres-dev psql -U postgres -c "CREATE DATABASE umami"

SELECT 'CREATE DATABASE umami'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'umami')\gexec
