-- ===============================
-- MIGRATION V19 : Ajout du champ icon_url sur la table projects
-- ===============================
-- icon_url peut contenir :
--   - une URL d'image uploadée (https://...)
--   - un emoji unicode encodé (ex: "🚀")
--   - null (fallback sur l'icon généré côté frontend)

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS icon_url VARCHAR(500);
