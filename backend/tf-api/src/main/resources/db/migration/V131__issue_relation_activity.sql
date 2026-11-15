-- V131 : les liens entre issues entrent à leur activité (la vue du workflow, R166, séance n°24 du Conseil).
-- Dépend de : V16 (issue_activity, issue_activity_type), V22 (issue_relations).
--
-- Poser ou retirer un lien (« bloque », « est bloquée par », « doublon de », « liée à ») se garde à l'activité des deux
-- issues, comme les autres changements : `new_value` (ajout) ou `old_value` (retrait) dit le lien vu de l'issue, puis la
-- clé de l'autre issue (« BLOCKED_BY WEB-11 »). PostgreSQL (12 et plus) ajoute une valeur d'enum dans la transaction de
-- la migration ; aucune ligne ne s'en sert ici.
ALTER TYPE issue_activity_type ADD VALUE IF NOT EXISTS 'RELATION_ADDED';
ALTER TYPE issue_activity_type ADD VALUE IF NOT EXISTS 'RELATION_REMOVED';
