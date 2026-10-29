-- Recette du 29/10/2026 (séance n°7 du Conseil, R38) : un refus de règle n'est pas un échec. Une mission que les règles
-- refusent au départ (par exemple sur un dépôt public) reste FAILED pour la file d'attente, mais l'écran et la
-- notification la disent « Not started », avec sa raison, au lieu de « Agent failed ».
ALTER TABLE delivery_runs ADD COLUMN refused BOOLEAN NOT NULL DEFAULT FALSE;
