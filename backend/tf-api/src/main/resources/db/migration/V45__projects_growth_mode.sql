-- PROD-1.8 Phase 3 (Inc B) : mode « montée en compétence » par projet.
-- OFF = pur fit/efficacité ; ON = le Smart Assign autorise un bonus « stretch » (cf. .ai/PROD-1.8-growth-design.md).
ALTER TABLE projects ADD COLUMN growth_mode BOOLEAN NOT NULL DEFAULT false;
