-- Sprint de la v2 : qui pose une demande de validation (décision J4 de l'atelier design, retenue le 28/10/2026).
--
-- `agent` : l'agent veut faire une action que les règles demandent. `runner` : TaskForce lui-même demande, avant une
-- sortie (push, pull request), le lancement des tests du projet (S1) ou le démarrage d'une mission. La demande le dit
-- en clair, à l'écran et dans la notification.
ALTER TABLE delivery_run_approvals ADD COLUMN asked_by VARCHAR(16) NOT NULL DEFAULT 'agent';
