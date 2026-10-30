-- La carte de résultat d'une mission (R78, séance n°13) se lit sur les faits que le runner rapporte, jamais sur le
-- résumé de l'agent : la branche et ses commits, les tests du projet lancés par le runner (combien ont passé, sur
-- combien, quand leur sortie le dit), et la fin de la mission. Vides pour une mission d'un runner plus ancien.
ALTER TABLE delivery_runs
    ADD COLUMN branch             VARCHAR(255),
    ADD COLUMN commits            INTEGER,
    ADD COLUMN tests_command      VARCHAR(500),
    ADD COLUMN tests_ran          BOOLEAN,
    ADD COLUMN tests_passed       BOOLEAN,
    ADD COLUMN tests_passed_count INTEGER,
    ADD COLUMN tests_total        INTEGER,
    ADD COLUMN ended_at           TIMESTAMP;

