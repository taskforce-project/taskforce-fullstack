-- =============================================================================
--  TaskForce — Tableau de bord bêta fermée (funnel + engagement)  [P1c, option B]
-- =============================================================================
--  Un runbook SQL, sans infra. On le lance pendant la bêta pour lire le funnel
--  (signup -> activation -> première valeur -> action coeur -> rétention), la
--  qualité des features IA et le feedback, le tout filtré par cohorte de bêta.
--
--  Toutes les requêtes sont bâties sur le schéma RÉEL de prod (colonnes/enums
--  vérifiés le 27/08). Rien d'inventé.
--
--  -----------------------------------------------------------------------------
--  COMMENT LANCER (depuis la machine locale, sans corrompre l'UTF-8) :
--
--    scp -i ~/.ssh/id_ed25519_vm_ecole ops/analytics/beta-funnel.sql \
--        pmichel@100.122.50.25:/tmp/beta-funnel.sql
--    ssh -i ~/.ssh/id_ed25519_vm_ecole pmichel@100.122.50.25 \
--        "docker cp /tmp/beta-funnel.sql taskforce-postgres-prod:/tmp/ && \
--         docker exec taskforce-postgres-prod psql -U taskforce -d taskforce -f /tmp/beta-funnel.sql"
--
--  (PowerShell : mêmes 2 commandes, une par ligne — pas de '&&' côté PowerShell,
--   il est déjà à l'intérieur des guillemets exécutés sur la VM par bash.)
--
--  -----------------------------------------------------------------------------
--  PÉRIMÈTRE (:POP) — qui compte comme « la bêta ». Par défaut : tout utilisateur
--  taggé d'une cohorte. Pour changer, éditer la ligne \set POP ci-dessous, OU
--  passer -v en ligne de commande (prioritaire sur le défaut) :
--
--    • Dry-run MAINTENANT (personne n'est encore taggé) :   -v POP=TRUE
--    • Une seule cohorte :  éditer -> \set POP u.beta_cohort = 'beta_2026_09'
--
--  -----------------------------------------------------------------------------
--  TAGGER LES TESTEURS (à faire depuis l'intake form, décommenter et adapter) :
--
--    -- UPDATE users SET beta_cohort='beta_2026_09', beta_context='PROFESSIONAL'
--    --  WHERE email='prenom.nom@exemple.com';
--    -- beta_context ∈ ('PROFESSIONAL','PERSONAL','FREE')   -- pro / perso / libre
--
--  NOTE hypothèse : ai_token_usage.account_id = workspace_id (cf. assertWithin
--  Quota(workspaceId)). L'usage IA « par testeur » est donc approximé par le
--  propriétaire du workspace (un workspace est partagé entre membres).
-- =============================================================================

\pset pager off
\pset null '(null)'

-- Périmètre : override par -v POP=... sinon défaut = cohortes taggées.
\if :{?POP}
\else
\set POP u.beta_cohort IS NOT NULL
\endif

-- --- Vues temporaires (session-scoped, auto-supprimées à la déconnexion) -------
-- Lancer TOUT le fichier (ou au moins ce bloc SETUP) avant les requêtes.

DROP VIEW IF EXISTS beta_flags;
DROP VIEW IF EXISTS beta_activity;
DROP VIEW IF EXISTS beta_pop;

CREATE TEMP VIEW beta_pop AS
SELECT u.id, u.email, u.display_name, u.beta_cohort, u.beta_context,
       u.is_active, u.onboarding_completed, u.plan_type, u.plan_status,
       u.created_at, u.created_at::date AS signed_up
FROM users u
WHERE :POP;

-- Toute action « signifiante » d'un utilisateur, unifiée (pour rétention / dernier actif).
CREATE TEMP VIEW beta_activity AS
SELECT actor_id            AS user_id, 'issue_activity' AS src, created_at AS ts FROM issue_activity WHERE actor_id IS NOT NULL
UNION ALL SELECT author_id,            'comment',      created_at FROM issue_comments
UNION ALL SELECT created_by,           'project',      created_at FROM projects
UNION ALL SELECT assigned_by_user_id,  'smart_assign', created_at FROM assignment_events WHERE assigned_by_user_id IS NOT NULL
UNION ALL SELECT ac.user_id,           'ai_chat',      am.created_at FROM ai_message am JOIN ai_conversation ac ON ac.id = am.conversation_id
UNION ALL SELECT user_id,              'feedback',     created_at FROM feedback;

-- Étapes du funnel, une ligne par utilisateur de la bêta (booléens).
CREATE TEMP VIEW beta_flags AS
SELECT bp.id, bp.beta_context, bp.beta_cohort, bp.is_active, bp.onboarding_completed,
  EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.user_id = bp.id)                                   AS in_workspace,
  EXISTS(SELECT 1 FROM projects pr WHERE pr.created_by = bp.id)                                         AS created_project,
  EXISTS(SELECT 1 FROM issue_activity ia WHERE ia.actor_id = bp.id AND ia.action = 'CREATED')           AS created_issue,
  EXISTS(SELECT 1 FROM issue_activity ia WHERE ia.actor_id = bp.id)                                     AS any_activity,
  EXISTS(SELECT 1 FROM assignment_events ae
          WHERE ae.assigned_by_user_id = bp.id AND ae.decision_source = 'SMART_ASSIGN')                 AS used_smart_assign,
  EXISTS(SELECT 1 FROM ai_message am JOIN ai_conversation ac ON ac.id = am.conversation_id
          WHERE ac.user_id = bp.id)                                                                     AS used_chat,
  EXISTS(SELECT 1 FROM feedback f WHERE f.user_id = bp.id)                                              AS gave_feedback
FROM beta_pop bp;


\echo
\echo ================================================================
\echo  Q1 — Population de la bêta (par cohorte / contexte)
\echo ================================================================
SELECT COALESCE(beta_cohort, '(non taggé)')  AS cohorte,
       COALESCE(beta_context, '(aucun)')     AS contexte,
       count(*)                              AS testeurs,
       count(*) FILTER (WHERE is_active)     AS comptes_actifs
FROM beta_pop u
GROUP BY 1, 2
ORDER BY 1, 2;


\echo
\echo ================================================================
\echo  Q2 — Funnel global (nb testeurs à chaque étape)
\echo    signup > compte actif > onboardé > dans un workspace >
\echo    a créé un projet > a créé une issue > a utilisé l IA > feedback
\echo ================================================================
SELECT count(*)                                                     AS "1_signup",
       count(*) FILTER (WHERE is_active)                            AS "2_actif",
       count(*) FILTER (WHERE onboarding_completed)                 AS "3_onboarde",
       count(*) FILTER (WHERE in_workspace)                         AS "4_workspace",
       count(*) FILTER (WHERE created_project)                      AS "5_projet",
       count(*) FILTER (WHERE created_issue)                        AS "6_issue",
       count(*) FILTER (WHERE used_smart_assign OR used_chat)       AS "7_ia",
       count(*) FILTER (WHERE gave_feedback)                        AS "8_feedback"
FROM beta_flags;

\echo -- ... les mêmes étapes en % du signup :
SELECT round(100.0 * count(*) FILTER (WHERE is_active)                      / NULLIF(count(*),0)) AS "2_actif_%",
       round(100.0 * count(*) FILTER (WHERE onboarding_completed)           / NULLIF(count(*),0)) AS "3_onboarde_%",
       round(100.0 * count(*) FILTER (WHERE in_workspace)                   / NULLIF(count(*),0)) AS "4_workspace_%",
       round(100.0 * count(*) FILTER (WHERE created_project)                / NULLIF(count(*),0)) AS "5_projet_%",
       round(100.0 * count(*) FILTER (WHERE created_issue)                  / NULLIF(count(*),0)) AS "6_issue_%",
       round(100.0 * count(*) FILTER (WHERE used_smart_assign OR used_chat) / NULLIF(count(*),0)) AS "7_ia_%",
       round(100.0 * count(*) FILTER (WHERE gave_feedback)                  / NULLIF(count(*),0)) AS "8_feedback_%"
FROM beta_flags;


\echo
\echo ================================================================
\echo  Q2b — Funnel par CONTEXTE (pro / perso / libre)
\echo ================================================================
SELECT COALESCE(beta_context, '(aucun)')                        AS contexte,
       count(*)                                                 AS signup,
       count(*) FILTER (WHERE onboarding_completed)             AS onboarde,
       count(*) FILTER (WHERE created_project)                  AS projet,
       count(*) FILTER (WHERE created_issue)                    AS issue,
       count(*) FILTER (WHERE used_smart_assign OR used_chat)   AS ia,
       count(*) FILTER (WHERE gave_feedback)                    AS feedback
FROM beta_flags
GROUP BY 1
ORDER BY 1;


\echo
\echo ================================================================
\echo  Q3 — Funnel par COHORTE (comparer les vagues)
\echo ================================================================
SELECT COALESCE(beta_cohort, '(non taggé)')                     AS cohorte,
       count(*)                                                 AS signup,
       count(*) FILTER (WHERE onboarding_completed)             AS onboarde,
       count(*) FILTER (WHERE created_project)                  AS projet,
       count(*) FILTER (WHERE created_issue)                    AS issue,
       count(*) FILTER (WHERE used_smart_assign OR used_chat)   AS ia
FROM beta_flags
GROUP BY 1
ORDER BY 1;


\echo
\echo ================================================================
\echo  Q4 — Engagement par testeur (la « fiche de suivi »)
\echo ================================================================
SELECT bp.email,
       bp.beta_context                                   AS contexte,
       bp.signed_up                                      AS inscrit_le,
       bp.onboarding_completed                           AS onboarde,
       (SELECT count(*) FROM projects pr WHERE pr.created_by = bp.id)                                            AS projets,
       (SELECT count(*) FROM issue_activity ia WHERE ia.actor_id = bp.id AND ia.action = 'CREATED')             AS issues_creees,
       (SELECT count(*) FROM issue_activity ia WHERE ia.actor_id = bp.id AND ia.action = 'COMPLETED')           AS issues_finies,
       (SELECT count(*) FROM issue_comments c WHERE c.author_id = bp.id)                                         AS commentaires,
       (SELECT count(*) FROM assignment_events ae
          WHERE ae.assigned_by_user_id = bp.id AND ae.decision_source = 'SMART_ASSIGN')                          AS smart_assign,
       (SELECT count(*) FROM ai_message am JOIN ai_conversation ac ON ac.id = am.conversation_id
          WHERE ac.user_id = bp.id)                                                                             AS msgs_ia,
       (SELECT count(DISTINCT ts::date) FROM beta_activity a WHERE a.user_id = bp.id)                            AS jours_actifs,
       (SELECT max(ts) FROM beta_activity a WHERE a.user_id = bp.id)                                             AS dernier_actif
FROM beta_pop bp
ORDER BY jours_actifs DESC NULLS LAST, issues_creees DESC;


\echo
\echo ================================================================
\echo  Q5 — Rétention (revenu après J0, encore actif à J7+)
\echo    « revenu_apres_J0 » = a fait au moins une action un jour ULTÉRIEUR
\echo    à son inscription ; « actif_J7 » = action au moins 7 jours après.
\echo ================================================================
WITH r AS (
  SELECT bp.id, bp.beta_context,
         (a.ts::date - bp.signed_up) AS offset_days
  FROM beta_pop bp
  LEFT JOIN beta_activity a ON a.user_id = bp.id
)
SELECT COALESCE(beta_context, '(aucun)')                          AS contexte,
       count(DISTINCT id)                                         AS signup,
       count(DISTINCT id) FILTER (WHERE offset_days >= 1)         AS revenu_apres_J0,
       count(DISTINCT id) FILTER (WHERE offset_days >= 7)         AS actif_J7
FROM r
GROUP BY 1
ORDER BY 1;


\echo
\echo ================================================================
\echo  Q6 — Smart Assign : adoption + qualité
\echo ================================================================
SELECT count(*)                                        AS suggestions,
       count(DISTINCT assigned_by_user_id)             AS testeurs_utilisateurs,
       count(*) FILTER (WHERE accepted)                AS acceptees,
       count(*) FILTER (WHERE resolved_successfully)   AS resolues_ok
FROM assignment_events ae
WHERE ae.decision_source = 'SMART_ASSIGN'
  AND ae.assigned_by_user_id IN (SELECT id FROM beta_pop);


\echo
\echo ================================================================
\echo  Q7 — Chat IA : adoption
\echo ================================================================
SELECT count(DISTINCT ac.user_id)               AS testeurs_ayant_chatte,
       count(*)                                 AS messages,
       COALESCE(sum(am.total_tokens), 0)        AS tokens
FROM ai_message am
JOIN ai_conversation ac ON ac.id = am.conversation_id
WHERE ac.user_id IN (SELECT id FROM beta_pop);


\echo
\echo ================================================================
\echo  Q8 — Fiabilité IA (ai_runs, 30 derniers jours) — SANTÉ INFRA
\echo    (non filtré par cohorte : lecture opérationnelle, pas produit)
\echo    Surveiller les status hors SUCCESS et fallback_used = true.
\echo ================================================================
SELECT feature_name,
       status,
       fallback_used,
       count(*)                              AS runs,
       round(avg(latency_ms))                AS latence_moy_ms,
       sum(input_tokens + output_tokens)     AS tokens
FROM ai_runs
WHERE created_at >= now() - interval '30 days'
GROUP BY 1, 2, 3
ORDER BY 1, runs DESC;


\echo
\echo ================================================================
\echo  Q9 — Consommation IA vs plafond du plan (par workspace)
\echo    Plafonds appliqués : FREE 100k / BASIC 500k / BUSINESS 2M.
\echo    account_id = workspace_id ; contexte = celui du propriétaire.
\echo ================================================================
SELECT w.slug,
       u.email                                      AS proprietaire,
       u.beta_context                               AS contexte,
       u.plan_type,
       atu.period                                   AS periode,
       atu.total_tokens,
       atu.request_count                            AS requetes,
       CASE u.plan_type WHEN 'FREE' THEN 100000 WHEN 'BASIC' THEN 500000
                        WHEN 'BUSINESS' THEN 2000000 END                        AS plafond,
       round(100.0 * atu.total_tokens /
             NULLIF(CASE u.plan_type WHEN 'FREE' THEN 100000 WHEN 'BASIC' THEN 500000
                                     WHEN 'BUSINESS' THEN 2000000 END, 0))       AS pct_plafond
FROM ai_token_usage atu
JOIN workspaces w ON w.id = atu.account_id
JOIN users u      ON u.id = w.owner_id
WHERE w.owner_id IN (SELECT id FROM beta_pop)
ORDER BY atu.total_tokens DESC;


\echo
\echo ================================================================
\echo  Q10 — Journal du feedback in-app (lecture qualitative)
\echo ================================================================
SELECT f.created_at,
       bp.email,
       bp.beta_context      AS contexte,
       f.category,
       f.context            AS ecran,
       left(f.message, 200) AS message
FROM feedback f
JOIN beta_pop bp ON bp.id = f.user_id
ORDER BY f.created_at DESC;


\echo
\echo ================================================================
\echo  Q11 — Conversion / paiement
\echo ================================================================
SELECT sh.created_at, bp.email, sh.event_type, sh.plan_type, sh.amount_paid, sh.currency
FROM subscription_history sh
JOIN beta_pop bp ON bp.id = sh.user_id
ORDER BY sh.created_at DESC;

\echo -- ... et les plans actuels dans la bêta :
SELECT plan_type, plan_status::text AS plan_status, count(*) AS testeurs
FROM beta_pop
GROUP BY 1, 2
ORDER BY 3 DESC;

\echo
\echo === Fin du rapport bêta. ===
