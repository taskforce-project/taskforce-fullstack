-- Sprint de la v2 : la commande de test déclarée d'un projet (spécification de la v2, §8.3 ; R32, décidée le 28/10/2026).
--
-- Le runner la lance après le travail de l'agent (niveau S1) : tant que la machine n'est pas isolée, l'agent ne lance
-- aucun script du dépôt. NULL : aucun test lancé. Elle s'exécute sur l'ordinateur de la personne qui délègue, qui
-- l'accepte une première fois, et à chaque changement.
ALTER TABLE projects ADD COLUMN test_command VARCHAR(500);
