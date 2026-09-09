-- Lien Projet <-> depot de code (TF-AGENT-DELIVERY, slice 1). Facon Linear : un projet peut etre
-- rattache a un depot (cree ou lie a la creation, ou plus tard). Sert de defaut au coding agent
-- (il sait OU travailler). NULL = aucun depot lie. `repo_provider` generalise (github aujourd'hui,
-- gitlab demain) ; `repo_full_name` = "owner/name" chez le provider.
ALTER TABLE projects ADD COLUMN repo_provider  VARCHAR(30);
ALTER TABLE projects ADD COLUMN repo_full_name VARCHAR(255);
