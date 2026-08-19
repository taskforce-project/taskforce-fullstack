-- V66 — Consommation IA par COMPTE (propriétaire) et non plus par workspace
--
-- Le plan IA vit sur le user propriétaire (User.planType). Compter le quota par *workspace* le rend
-- contournable : un utilisateur multiplie son quota en créant des workspaces. On re-clé donc l'agrégat
-- mensuel sur le COMPTE (= owner du workspace), en fusionnant les lignes des workspaces d'un même
-- propriétaire pour un mois donné. Idempotent au sens Flyway (forward-only), sûr en prod (backfill réel).

-- 1) Nouvelle colonne « compte » (nullable le temps du backfill).
ALTER TABLE ai_token_usage ADD COLUMN account_id BIGINT;

-- 2) Backfill : chaque ligne workspace → son propriétaire.
UPDATE ai_token_usage t
SET account_id = w.owner_id
FROM workspaces w
WHERE t.workspace_id = w.id;

-- 3) Lignes orphelines (workspace supprimé, rien à rattacher) → on retire.
DELETE FROM ai_token_usage WHERE account_id IS NULL;

-- 4) Fusion des lignes d'un même (compte, mois) : on somme dans la ligne d'id minimal…
UPDATE ai_token_usage keep
SET prompt_tokens     = agg.p,
    completion_tokens = agg.c,
    total_tokens      = agg.t,
    request_count     = agg.r
FROM (
    SELECT account_id,
           period,
           SUM(prompt_tokens)     AS p,
           SUM(completion_tokens) AS c,
           SUM(total_tokens)      AS t,
           SUM(request_count)     AS r,
           MIN(id)                AS keep_id
    FROM ai_token_usage
    GROUP BY account_id, period
) agg
WHERE keep.id = agg.keep_id;

-- … puis on supprime les doublons désormais agrégés.
DELETE FROM ai_token_usage u
USING (
    SELECT account_id, period, MIN(id) AS keep_id
    FROM ai_token_usage
    GROUP BY account_id, period
) k
WHERE u.account_id = k.account_id
  AND u.period = k.period
  AND u.id <> k.keep_id;

-- 5) Contraintes définitives : NOT NULL + FK users + un seul agrégat par (compte, mois).
ALTER TABLE ai_token_usage ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE ai_token_usage
    ADD CONSTRAINT fk_ai_usage_account FOREIGN KEY (account_id) REFERENCES users(id) ON DELETE CASCADE;

-- 6) Retrait de l'ancien schéma workspace (l'index unique et la FK inline tombent avec la colonne).
DROP INDEX IF EXISTS uq_ai_token_usage;
ALTER TABLE ai_token_usage DROP COLUMN workspace_id;

-- 7) Unicité par (compte, mois).
CREATE UNIQUE INDEX uq_ai_token_usage_account ON ai_token_usage (account_id, period);
