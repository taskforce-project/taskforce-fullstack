-- PROD-1.8 Phase 2 : signaux Smart Assign — capacité déclarée + séniorité sur le profil.
ALTER TABLE member_skill_profiles
    ADD COLUMN capacity_hours_per_week INT,
    ADD COLUMN seniority VARCHAR(20);
-- seniority attendue : JUNIOR | MID | SENIOR | LEAD (validée côté service).
