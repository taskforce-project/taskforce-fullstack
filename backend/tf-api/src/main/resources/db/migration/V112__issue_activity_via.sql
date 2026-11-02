-- V112 : l'activité d'une issue dit qui a fait quoi (recette de la boucle de mission, 01/11/2026).
-- Dépend de : V16 (issue_activity, issue_activity_type).
--
-- `via` : l'agent par qui l'action est passée. « Cortex » quand la personne crée l'issue depuis la carte qu'il a
-- préparée ; le nom de l'agent d'une mission (« Claude Code ») quand il agit au nom de la personne qui l'a déléguée,
-- par la session déléguée. Null quand la personne a agi seule : l'historique existant ne change pas.
ALTER TABLE issue_activity ADD COLUMN via VARCHAR(60);

-- Ce qu'une mission fait sur l'issue, puis le geste de la personne sur son résultat. PostgreSQL (12 et plus) ajoute
-- une valeur d'enum dans la transaction de la migration ; aucune ligne ne s'en sert ici.
ALTER TYPE issue_activity_type ADD VALUE IF NOT EXISTS 'CHECKLIST_CHECKED';
ALTER TYPE issue_activity_type ADD VALUE IF NOT EXISTS 'CHECKLIST_UNCHECKED';
ALTER TYPE issue_activity_type ADD VALUE IF NOT EXISTS 'PULL_REQUEST_OPENED';
ALTER TYPE issue_activity_type ADD VALUE IF NOT EXISTS 'MISSION_APPLIED';
ALTER TYPE issue_activity_type ADD VALUE IF NOT EXISTS 'MISSION_DISCARDED';
ALTER TYPE issue_activity_type ADD VALUE IF NOT EXISTS 'MISSION_RETRIED';
