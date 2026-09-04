-- Suppression de compte en 2 temps (TF-ACCT-DELETE). Au lieu d'une purge immediate et definitive,
-- la demande PLANIFIE la suppression : le compte reste recuperable pendant un delai de grace (30 j),
-- puis un job quotidien purge au-dela du delai (anonymisation + Keycloak + transfert/suppression des
-- workspaces possedes). NULL = aucune suppression en cours.
ALTER TABLE users ADD COLUMN deletion_scheduled_at TIMESTAMP NULL;

-- Index partiel : le job de purge ne balaie que les comptes reellement planifies (rare).
CREATE INDEX idx_users_deletion_scheduled ON users (deletion_scheduled_at) WHERE deletion_scheduled_at IS NOT NULL;
