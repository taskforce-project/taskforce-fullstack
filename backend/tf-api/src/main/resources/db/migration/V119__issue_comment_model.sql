-- V119 : ce que Cortex écrit sur une issue porte le modèle qui le faisait parler (R123, séance n°18 du Conseil).
-- Dépend de : V16 (issue_comments), V112 (issue_activity.via), V116 (issue_comments.via).
--
-- `model` : le modèle qui faisait parler l'agent de `via` quand il a écrit le commentaire ou fait le geste
-- (« qwen3:8b » pour Cortex, `via` disant « Cortex »). Null quand la personne a agi seule, ou quand l'agent ne dit pas
-- son modèle : les lignes existantes ne changent pas.
ALTER TABLE issue_comments ADD COLUMN model VARCHAR(128);
ALTER TABLE issue_activity ADD COLUMN model VARCHAR(128);
