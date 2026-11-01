-- « Apply » ne fusionne pas un résultat dont les tests du projet ont échoué (R87, séance n°14 du Conseil), sauf si la
-- personne qui a délégué passe outre en disant pourquoi. Sa raison se garde ici, avec le geste (outcome, outcome_by,
-- outcome_at) : le dossier de preuve est scellé à la fin de la mission.
ALTER TABLE delivery_runs
    ADD COLUMN outcome_reason VARCHAR(2000);
