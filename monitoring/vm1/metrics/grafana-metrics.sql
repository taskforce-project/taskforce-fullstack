-- =====================================================================
-- TaskForce - Metriques PRODUIT pour Grafana (role read-only + vues)
-- =====================================================================
-- But : exposer a Grafana un suivi de l'evolution du produit (utilisateurs,
--       plans, inscriptions dans le temps, derniere activite) SANS donner
--       acces aux tables brutes.
--
-- Securite :
--   - Role `grafana_ro` LOGIN, lecture seule, borne au schema `metrics`.
--   - Les vues `metrics.*` tournent avec les droits de LEUR PROPRIETAIRE
--     (semantique "security definer" par defaut sur Postgres) : grafana_ro
--     n'a JAMAIS acces direct a `public.users` & co, seulement aux vues.
--   - Aucune vue n'expose de secret (stripe_customer_id, tokens, mdp...).
--
-- Exclusions (metriques = vrais utilisateurs, pas la demo ni le CEO) :
--   - comptes de demo "data-only" : keycloak_id LIKE 'seed-%'
--   - Pierre (proprietaire/CEO)   : pierre.michel.work@gmail.com
--   - admin dev residuel          : admin@taskforce.dev
--   - workspaces de demo          : slug IN ('demo','nimbus','taskforce-demo')
--
-- Lancer (sur la VM1, POSTGRES_USER/POSTGRES_DB = ceux de .env.prod) :
--   docker exec -i taskforce-postgres-prod \
--     psql -v ON_ERROR_STOP=1 -v grafana_pw="'MOT_DE_PASSE_FORT'" \
--          -U "$POSTGRES_USER" -d "$POSTGRES_DB" < grafana-metrics.sql
--
-- Idempotent : re-jouable (CREATE OR REPLACE / IF NOT EXISTS). Le -v grafana_pw
-- (re)definit le mot de passe du role a chaque passage.
-- =====================================================================

-- --------------------------------------------------------------------
-- 1. Role de lecture (mot de passe fourni via -v grafana_pw)
-- --------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') THEN
        CREATE ROLE grafana_ro LOGIN;
    END IF;
END $$;

ALTER ROLE grafana_ro WITH LOGIN PASSWORD :'grafana_pw';
-- Filet : jamais de super-pouvoirs, jamais de creation.
ALTER ROLE grafana_ro NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

-- --------------------------------------------------------------------
-- 2. Schema dedie (isole les vues du reste)
-- --------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS metrics;

-- --------------------------------------------------------------------
-- 3. Vue de base INTERNE : les "vrais" utilisateurs (hors demo + hors toi).
--    NON exposee a grafana_ro (sert seulement de brique aux vues agregees).
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW metrics.real_users AS
SELECT u.*
FROM public.users u
WHERE u.keycloak_id NOT LIKE 'seed-%'
  AND lower(u.email) NOT LIKE '%@seed.taskforce.dev'
  AND lower(u.email) <> 'pierre.michel.work@gmail.com'
  AND lower(u.email) <> 'admin@taskforce.dev';

-- --------------------------------------------------------------------
-- 4. KPIs utilisateurs (une ligne, pour des panels "stat")
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW metrics.kpi_users AS
SELECT
    count(*)                                                          AS total_users,
    count(*) FILTER (WHERE is_active)                                 AS active_users,
    count(*) FILTER (WHERE plan_type = 'FREE')                        AS free_users,
    count(*) FILTER (WHERE plan_type = 'BASIC')                       AS basic_users,
    count(*) FILTER (WHERE plan_type = 'BUSINESS')                    AS business_users,
    count(*) FILTER (WHERE plan_type = 'ENTERPRISE')                  AS enterprise_users,
    count(*) FILTER (WHERE plan_type <> 'FREE')                       AS paid_users,
    count(*) FILTER (WHERE onboarding_completed)                      AS onboarded_users,
    count(*) FILTER (WHERE deletion_scheduled_at IS NOT NULL)         AS pending_deletion,
    count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS signups_24h,
    count(*) FILTER (WHERE created_at >= now() - interval '7 days')   AS signups_7d,
    count(*) FILTER (WHERE created_at >= now() - interval '30 days')  AS signups_30d
FROM metrics.real_users;

-- --------------------------------------------------------------------
-- 5. Repartition par plan (pour un camembert / barres)
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW metrics.plan_distribution AS
SELECT plan_type::text AS plan, count(*) AS users
FROM metrics.real_users
GROUP BY plan_type
ORDER BY plan_type;

-- --------------------------------------------------------------------
-- 6. Inscriptions par jour + total cumule (courbe de croissance,
--    RETROACTIVE : reconstruite depuis created_at).
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW metrics.signups_daily AS
SELECT
    date_trunc('day', created_at)                                       AS day,
    count(*)                                                            AS signups,
    sum(count(*)) OVER (ORDER BY date_trunc('day', created_at))         AS cumulative_users
FROM metrics.real_users
GROUP BY 1
ORDER BY 1;

-- --------------------------------------------------------------------
-- 7. Dernieres inscriptions (table)
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW metrics.recent_signups AS
SELECT
    created_at,
    COALESCE(display_name, split_part(email, '@', 1)) AS name,
    email,
    plan_type::text                                    AS plan,
    onboarding_completed,
    beta_cohort
FROM metrics.real_users
ORDER BY created_at DESC;

-- --------------------------------------------------------------------
-- 8. KPIs workspaces / projets / issues (hors demo)
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW metrics.kpi_workspaces AS
SELECT
    (SELECT count(*) FROM public.workspaces w
       WHERE w.slug NOT IN ('demo','nimbus','taskforce-demo'))              AS total_workspaces,
    (SELECT count(*) FROM public.projects p
       JOIN public.workspaces w ON w.id = p.workspace_id
       WHERE w.slug NOT IN ('demo','nimbus','taskforce-demo'))             AS total_projects,
    (SELECT count(*) FROM public.issues i
       JOIN public.projects p   ON p.id = i.project_id
       JOIN public.workspaces w ON w.id = p.workspace_id
       WHERE w.slug NOT IN ('demo','nimbus','taskforce-demo'))            AS total_issues;

-- --------------------------------------------------------------------
-- 9. Activite EXTERNE (hors toi + hors demo) : issue_activity U audit_logs.
--    "Derniere activite autre que moi" que tu veux suivre.
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW metrics.external_activity AS
SELECT
    ia.created_at                                       AS at,
    COALESCE(u.display_name, split_part(u.email,'@',1)) AS who,
    u.email                                             AS email,
    'issue:' || ia.action::text                         AS what,
    w.name                                              AS workspace
FROM public.issue_activity ia
JOIN public.users      u ON u.id = ia.actor_id
JOIN public.issues     i ON i.id = ia.issue_id
JOIN public.projects   p ON p.id = i.project_id
JOIN public.workspaces w ON w.id = p.workspace_id
WHERE u.keycloak_id NOT LIKE 'seed-%'
  AND lower(u.email) <> 'pierre.michel.work@gmail.com'
  AND lower(u.email) <> 'admin@taskforce.dev'
  AND w.slug NOT IN ('demo','nimbus','taskforce-demo')
UNION ALL
SELECT
    al.created_at                                       AS at,
    COALESCE(u.display_name, split_part(u.email,'@',1)) AS who,
    u.email                                             AS email,
    'audit:' || al.action                               AS what,
    w.name                                              AS workspace
FROM public.audit_logs al
JOIN public.users       u ON u.id = al.actor_user_id
LEFT JOIN public.workspaces w ON w.id = al.workspace_id
WHERE u.keycloak_id NOT LIKE 'seed-%'
  AND lower(u.email) <> 'pierre.michel.work@gmail.com'
  AND lower(u.email) <> 'admin@taskforce.dev'
  AND (w.slug IS NULL OR w.slug NOT IN ('demo','nimbus','taskforce-demo'));

-- Secondes depuis la derniere activite externe (-1 si aucune) : panel "stat" alertable.
CREATE OR REPLACE VIEW metrics.seconds_since_last_activity AS
SELECT COALESCE(EXTRACT(EPOCH FROM (now() - max(at)))::bigint, -1) AS seconds
FROM metrics.external_activity;

-- --------------------------------------------------------------------
-- 10. Droits : USAGE sur le schema + SELECT sur les vues EXPOSEES seulement
--     (real_users reste interne, jamais accordee).
-- --------------------------------------------------------------------
GRANT USAGE ON SCHEMA metrics TO grafana_ro;
GRANT SELECT ON
    metrics.kpi_users,
    metrics.plan_distribution,
    metrics.signups_daily,
    metrics.recent_signups,
    metrics.kpi_workspaces,
    metrics.external_activity,
    metrics.seconds_since_last_activity
TO grafana_ro;

-- Revoque tout acces qui aurait pu etre herite sur la brique interne.
REVOKE ALL ON metrics.real_users FROM grafana_ro;

-- Nouveaux objets futurs dans `metrics` : pas de SELECT automatique (on accorde a la main).
ALTER DEFAULT PRIVILEGES IN SCHEMA metrics REVOKE SELECT ON TABLES FROM grafana_ro;
