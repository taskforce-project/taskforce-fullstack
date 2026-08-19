-- ============================================================
-- V73 -- Onboarding utilisateur
-- ============================================================
-- Deux attributs portés par l'utilisateur (globaux, pas par workspace) :
--   * onboarding_completed : a-t-il franchi le parcours de première prise en main ?
--     Le front n'affiche le wizard qu'une fois. Défaut FALSE → tout compte existant
--     (re)passe par l'onboarding au prochain login, ce qui est le comportement voulu
--     pour peupler `member_skill_profiles` (Smart Assign) sur la base installée.
--   * job_title : rôle/intitulé déclaré à l'étape 1. Sert à la personnalisation et
--     d'amorce à la suggestion IA de compétences (rôle -> tags). La séniorité, elle,
--     vit déjà dans member_skill_profiles (par workspace).

ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN job_title VARCHAR(150);
