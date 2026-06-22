-- PROD-1.8 Phase 3 (Inc C) : objectifs de montée en compétence par membre.
-- growth_enabled : ce membre est volontairement « en développement ».
-- growth_target_skills : compétences cibles (tableau JSON) vers lesquelles on veut le faire progresser.
ALTER TABLE member_skill_profiles
    ADD COLUMN growth_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN growth_target_skills JSONB NOT NULL DEFAULT '[]';
