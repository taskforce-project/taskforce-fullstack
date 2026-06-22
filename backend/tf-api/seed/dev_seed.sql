-- =====================================================================
-- TaskForce — Seed DE DÉMO « équipe CEO » (idempotent, re-runnable)
-- =====================================================================
-- But : peupler un workspace démo réaliste rattaché à admin@taskforce.dev
--       pour tester Smart Assign, l'UI/UX, les rôles, les équipes, etc.
--
-- Idempotence : tout le contenu vit dans le workspace slug 'taskforce-demo'.
--   Re-run = on DROP ce workspace (cascade) puis on le reconstruit.
--   Les utilisateurs de démo (users) persistent (upsert par email).
--
-- ⚠️ Les coéquipiers sont des comptes DATA-ONLY (pas de compte Keycloak) :
--    on se connecte en tant qu'admin@taskforce.dev (le « CEO ») et on les voit
--    comme équipe / candidats Smart Assign. Ils ne peuvent pas se logger.
--
-- Lancer :
--   docker exec -i taskforce-postgres-dev psql -U postgres -d taskforce-db < backend/tf-api/seed/dev_seed.sql
--
-- Prérequis : migrations Flyway appliquées (admin@taskforce.dev doit exister, V17).
-- =====================================================================

DO $seed$
DECLARE
    v_admin   BIGINT;
    v_ws      BIGINT;
    -- coéquipiers
    v_sarah   BIGINT;  -- Frontend Lead
    v_marcus  BIGINT;  -- Backend
    v_aicha   BIGINT;  -- Fullstack
    v_tom     BIGINT;  -- DevOps
    v_lina    BIGINT;  -- Designer
    v_omar    BIGINT;  -- QA
    v_nina    BIGINT;  -- Data/AI
    v_diego   BIGINT;  -- Junior Frontend (candidat « montée en compétence »)
    -- projets
    v_web     BIGINT;
    v_api     BIGINT;
    v_ops     BIGINT;
    -- équipes
    v_tf_front BIGINT;
    v_tf_back  BIGINT;
    v_tf_plat  BIGINT;
BEGIN
    -- ----------------------------------------------------------------
    -- 0. Admin (« CEO »)
    -- ----------------------------------------------------------------
    SELECT id INTO v_admin FROM users WHERE email = 'admin@taskforce.dev';
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'admin@taskforce.dev introuvable — applique d''abord les migrations Flyway (V17).';
    END IF;

    -- ----------------------------------------------------------------
    -- 1. Reset du workspace démo (cascade : projets, issues, équipes, profils…)
    -- ----------------------------------------------------------------
    DELETE FROM workspaces WHERE slug = 'taskforce-demo';

    -- ----------------------------------------------------------------
    -- 2. Coéquipiers (data-only). Upsert par email ; keycloak_id factice unique.
    -- ----------------------------------------------------------------
    INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active)
    VALUES ('seed-0001-sarah',  'sarah.chen@seed.taskforce.dev',  'Sarah Chen',    'FREE', true)
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id INTO v_sarah;

    INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active)
    VALUES ('seed-0002-marcus', 'marcus.webb@seed.taskforce.dev', 'Marcus Webb',   'FREE', true)
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id INTO v_marcus;

    INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active)
    VALUES ('seed-0003-aicha',  'aicha.diallo@seed.taskforce.dev','Aïcha Diallo',  'FREE', true)
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id INTO v_aicha;

    INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active)
    VALUES ('seed-0004-tom',    'tom.berg@seed.taskforce.dev',    'Tom Berg',      'FREE', true)
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id INTO v_tom;

    INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active)
    VALUES ('seed-0005-lina',   'lina.park@seed.taskforce.dev',   'Lina Park',     'FREE', true)
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id INTO v_lina;

    INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active)
    VALUES ('seed-0006-omar',   'omar.haddad@seed.taskforce.dev', 'Omar Haddad',   'FREE', true)
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id INTO v_omar;

    INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active)
    VALUES ('seed-0007-nina',   'nina.volkov@seed.taskforce.dev', 'Nina Volkov',   'FREE', true)
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id INTO v_nina;

    INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active)
    VALUES ('seed-0008-diego',  'diego.santos@seed.taskforce.dev','Diego Santos',  'FREE', true)
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id INTO v_diego;

    -- ----------------------------------------------------------------
    -- 3. Workspace démo (owner = admin)
    -- ----------------------------------------------------------------
    INSERT INTO workspaces (name, slug, description, owner_id)
    VALUES ('TaskForce HQ', 'taskforce-demo', 'Espace de démo : équipe complète pour tester Smart Assign.', v_admin)
    RETURNING id INTO v_ws;

    -- Membres du workspace (admin OWNER + l'équipe)
    INSERT INTO workspace_members (workspace_id, user_id, role, invited_by) VALUES
        (v_ws, v_admin,  'OWNER',  NULL),
        (v_ws, v_sarah,  'ADMIN',  v_admin),
        (v_ws, v_marcus, 'ADMIN',  v_admin),
        (v_ws, v_aicha,  'MEMBER', v_admin),
        (v_ws, v_tom,    'MEMBER', v_admin),
        (v_ws, v_lina,   'MEMBER', v_admin),
        (v_ws, v_omar,   'MEMBER', v_admin),
        (v_ws, v_nina,   'MEMBER', v_admin),
        (v_ws, v_diego,  'MEMBER', v_admin);

    -- ----------------------------------------------------------------
    -- 4. Profils de compétences (skills_json = tableau de tags, lus par Smart Assign)
    --    Les tags correspondent aux labels d'issues → produit du signal de matching.
    -- ----------------------------------------------------------------
    INSERT INTO member_skill_profiles (workspace_id, user_id, profile_text, skills_json, capacity_hours_per_week, seniority) VALUES
        (v_ws, v_sarah,  'Frontend lead, design systems & React.', '["react","typescript","css","nextjs","ui"]', 38, 'LEAD'),
        (v_ws, v_marcus, 'Backend Java/Spring, perf & data.',      '["java","spring","sql","api"]',              40, 'SENIOR'),
        (v_ws, v_aicha,  'Fullstack polyvalente.',                 '["react","typescript","java","api"]',        35, 'MID'),
        (v_ws, v_tom,    'DevOps / plateforme.',                   '["docker","ci-cd","kubernetes","infra"]',    40, 'SENIOR'),
        (v_ws, v_lina,   'Product designer.',                      '["design","ui","ux","figma"]',               32, 'MID'),
        (v_ws, v_omar,   'QA & automatisation de tests.',          '["testing","qa","automation"]',              35, 'MID'),
        (v_ws, v_nina,   'Data & IA.',                             '["python","ml","ai","data","api"]',          30, 'SENIOR'),
        (v_ws, v_diego,  'Junior frontend, en montée en compétence.', '["html","css","react"]',                 40, 'JUNIOR');

    -- Diego est volontairement « en développement » → croissance ciblée (PROD-1.8 Phase 3 Inc C)
    UPDATE member_skill_profiles
       SET growth_enabled = true, growth_target_skills = '["typescript","react"]'
     WHERE workspace_id = v_ws AND user_id = v_diego;

    -- ----------------------------------------------------------------
    -- 5. Projets (+ statuts/types/labels/compteur par projet)
    -- ----------------------------------------------------------------
    -- helper interne : on crée chaque projet puis ses statuts/types/labels.

    -- ===== Projet WEB =====
    INSERT INTO projects (workspace_id, name, identifier, description, created_by, color, icon_url, growth_mode)
    VALUES (v_ws, 'Web Application', 'WEB', 'Application web TaskForce (frontend).', v_admin, 'bg-violet-500', 'lucide:Globe', true)
    RETURNING id INTO v_web;

    INSERT INTO issue_statuses (project_id, name, color, category, position, is_default) VALUES
        (v_web, 'Backlog',     '#94a3b8', 'BACKLOG'::issue_status_category,    0, false),
        (v_web, 'Todo',        '#6366f1', 'UNSTARTED'::issue_status_category,  1, true),
        (v_web, 'In Progress', '#f59e0b', 'STARTED'::issue_status_category,    2, false),
        (v_web, 'Done',        '#10b981', 'COMPLETED'::issue_status_category,  3, false),
        (v_web, 'Cancelled',   '#ef4444', 'CANCELLED'::issue_status_category,  4, false);
    INSERT INTO issue_types (project_id, name, color, icon, is_default) VALUES
        (v_web, 'Task',    '#6366f1', 'circle-dot', true),
        (v_web, 'Bug',     '#ef4444', 'bug',        false),
        (v_web, 'Feature', '#10b981', 'zap',        false);
    INSERT INTO project_labels (project_id, name, color) VALUES
        (v_web, 'react', '#06b6d4'), (v_web, 'typescript', '#3b82f6'), (v_web, 'css', '#8b5cf6'),
        (v_web, 'ui', '#ec4899'), (v_web, 'design', '#f97316'), (v_web, 'testing', '#10b981');

    -- ===== Projet API =====
    INSERT INTO projects (workspace_id, name, identifier, description, created_by, color, icon_url)
    VALUES (v_ws, 'API Platform', 'API', 'Backend Spring & API.', v_admin, 'bg-blue-500', 'lucide:Database')
    RETURNING id INTO v_api;

    INSERT INTO issue_statuses (project_id, name, color, category, position, is_default) VALUES
        (v_api, 'Backlog',     '#94a3b8', 'BACKLOG'::issue_status_category,    0, false),
        (v_api, 'Todo',        '#6366f1', 'UNSTARTED'::issue_status_category,  1, true),
        (v_api, 'In Progress', '#f59e0b', 'STARTED'::issue_status_category,    2, false),
        (v_api, 'Done',        '#10b981', 'COMPLETED'::issue_status_category,  3, false),
        (v_api, 'Cancelled',   '#ef4444', 'CANCELLED'::issue_status_category,  4, false);
    INSERT INTO issue_types (project_id, name, color, icon, is_default) VALUES
        (v_api, 'Task',    '#6366f1', 'circle-dot', true),
        (v_api, 'Bug',     '#ef4444', 'bug',        false),
        (v_api, 'Feature', '#10b981', 'zap',        false);
    INSERT INTO project_labels (project_id, name, color) VALUES
        (v_api, 'java', '#ef4444'), (v_api, 'spring', '#10b981'), (v_api, 'api', '#6366f1'),
        (v_api, 'sql', '#f59e0b'), (v_api, 'testing', '#06b6d4');

    -- ===== Projet OPS =====
    INSERT INTO projects (workspace_id, name, identifier, description, created_by, color, icon_url)
    VALUES (v_ws, 'Infrastructure', 'OPS', 'Déploiement, CI/CD, monitoring.', v_admin, 'bg-emerald-500', 'lucide:Cloud')
    RETURNING id INTO v_ops;

    INSERT INTO issue_statuses (project_id, name, color, category, position, is_default) VALUES
        (v_ops, 'Backlog',     '#94a3b8', 'BACKLOG'::issue_status_category,    0, false),
        (v_ops, 'Todo',        '#6366f1', 'UNSTARTED'::issue_status_category,  1, true),
        (v_ops, 'In Progress', '#f59e0b', 'STARTED'::issue_status_category,    2, false),
        (v_ops, 'Done',        '#10b981', 'COMPLETED'::issue_status_category,  3, false),
        (v_ops, 'Cancelled',   '#ef4444', 'CANCELLED'::issue_status_category,  4, false);
    INSERT INTO issue_types (project_id, name, color, icon, is_default) VALUES
        (v_ops, 'Task',    '#6366f1', 'circle-dot', true),
        (v_ops, 'Bug',     '#ef4444', 'bug',        false),
        (v_ops, 'Feature', '#10b981', 'zap',        false);
    INSERT INTO project_labels (project_id, name, color) VALUES
        (v_ops, 'docker', '#06b6d4'), (v_ops, 'ci-cd', '#8b5cf6'),
        (v_ops, 'kubernetes', '#3b82f6'), (v_ops, 'infra', '#10b981');

    -- ----------------------------------------------------------------
    -- 6. Membres de projet
    -- ----------------------------------------------------------------
    INSERT INTO project_members (project_id, user_id, role, added_by) VALUES
        (v_web, v_admin, 'LEAD'::project_role,   NULL),
        (v_web, v_sarah, 'LEAD'::project_role,   v_admin),
        (v_web, v_aicha, 'MEMBER'::project_role, v_admin),
        (v_web, v_diego, 'MEMBER'::project_role, v_admin),
        (v_web, v_lina,  'MEMBER'::project_role, v_admin),
        (v_web, v_omar,  'MEMBER'::project_role, v_admin),
        (v_api, v_admin,  'LEAD'::project_role,   NULL),
        (v_api, v_marcus, 'LEAD'::project_role,   v_admin),
        (v_api, v_aicha,  'MEMBER'::project_role, v_admin),
        (v_api, v_nina,   'MEMBER'::project_role, v_admin),
        (v_api, v_omar,   'MEMBER'::project_role, v_admin),
        (v_ops, v_admin, 'LEAD'::project_role,   NULL),
        (v_ops, v_tom,   'LEAD'::project_role,   v_admin),
        (v_ops, v_marcus,'MEMBER'::project_role, v_admin);

    -- ----------------------------------------------------------------
    -- 7. Issues (statut résolu via sous-requête par nom ; reporter = admin)
    --    Beaucoup d'issues NON ASSIGNÉES → pour tester Smart Assign.
    -- ----------------------------------------------------------------
    -- WEB
    INSERT INTO issues (project_id, sequence_number, title, status_id, type_id, priority, story_points, assignee_id, reporter_id, completed_at) VALUES
        (v_web, 1, 'Refonte de la page d''accueil',          (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='Done'),        (SELECT id FROM issue_types WHERE project_id=v_web AND name='Feature'), 'HIGH'::issue_priority,   5, v_sarah, v_admin, NOW() - INTERVAL '6 days'),
        (v_web, 2, 'Bug : le menu mobile ne s''ouvre pas',   (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='Done'),        (SELECT id FROM issue_types WHERE project_id=v_web AND name='Bug'),     'HIGH'::issue_priority,   2, v_aicha, v_admin, NOW() - INTERVAL '4 days'),
        (v_web, 3, 'Composant DataTable réutilisable',       (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='In Progress'), (SELECT id FROM issue_types WHERE project_id=v_web AND name='Feature'), 'MEDIUM'::issue_priority, 8, v_sarah, v_admin, NULL),
        (v_web, 4, 'Dark mode incomplet sur le dashboard',   (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='Todo'),        (SELECT id FROM issue_types WHERE project_id=v_web AND name='Bug'),     'MEDIUM'::issue_priority, 3, NULL,    v_admin, NULL),
        (v_web, 5, 'Page profil utilisateur',                (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='Todo'),        (SELECT id FROM issue_types WHERE project_id=v_web AND name='Feature'), 'MEDIUM'::issue_priority, 5, NULL,    v_admin, NULL),
        (v_web, 6, 'Tests E2E du parcours de connexion',     (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='Backlog'),     (SELECT id FROM issue_types WHERE project_id=v_web AND name='Task'),    'LOW'::issue_priority,    3, v_omar,  v_admin, NULL),
        (v_web, 7, 'Améliorer l''accessibilité des formulaires', (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='Backlog'), (SELECT id FROM issue_types WHERE project_id=v_web AND name='Task'),    'LOW'::issue_priority,    2, NULL,    v_admin, NULL),
        (v_web, 8, 'Skeleton loaders sur les listes',        (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='Todo'),        (SELECT id FROM issue_types WHERE project_id=v_web AND name='Feature'), 'LOW'::issue_priority,    2, v_diego, v_admin, NULL);

    -- API
    INSERT INTO issues (project_id, sequence_number, title, status_id, type_id, priority, story_points, assignee_id, reporter_id, completed_at) VALUES
        (v_api, 1, 'Endpoint de pagination des issues',      (SELECT id FROM issue_statuses WHERE project_id=v_api AND name='Done'),        (SELECT id FROM issue_types WHERE project_id=v_api AND name='Feature'), 'MEDIUM'::issue_priority, 3, v_marcus, v_admin, NOW() - INTERVAL '7 days'),
        (v_api, 2, 'Optimiser la requête N+1 sur les projets',(SELECT id FROM issue_statuses WHERE project_id=v_api AND name='Done'),        (SELECT id FROM issue_types WHERE project_id=v_api AND name='Bug'),     'HIGH'::issue_priority,   5, v_marcus, v_admin, NOW() - INTERVAL '3 days'),
        (v_api, 3, 'Webhooks Stripe (lifecycle abonnement)', (SELECT id FROM issue_statuses WHERE project_id=v_api AND name='In Progress'), (SELECT id FROM issue_types WHERE project_id=v_api AND name='Feature'), 'HIGH'::issue_priority,   8, v_aicha,  v_admin, NULL),
        (v_api, 4, 'Rate limiting sur l''authentification',  (SELECT id FROM issue_statuses WHERE project_id=v_api AND name='Todo'),        (SELECT id FROM issue_types WHERE project_id=v_api AND name='Feature'), 'HIGH'::issue_priority,   5, NULL,     v_admin, NULL),
        (v_api, 5, 'Migration : index manquants',            (SELECT id FROM issue_statuses WHERE project_id=v_api AND name='Todo'),        (SELECT id FROM issue_types WHERE project_id=v_api AND name='Task'),    'MEDIUM'::issue_priority, 3, NULL,     v_admin, NULL),
        (v_api, 6, 'Tests d''intégration API workspaces',    (SELECT id FROM issue_statuses WHERE project_id=v_api AND name='Backlog'),     (SELECT id FROM issue_types WHERE project_id=v_api AND name='Task'),    'MEDIUM'::issue_priority, 5, NULL,     v_admin, NULL),
        (v_api, 7, 'Cache Redis pour les analytics',         (SELECT id FROM issue_statuses WHERE project_id=v_api AND name='Backlog'),     (SELECT id FROM issue_types WHERE project_id=v_api AND name='Feature'), 'LOW'::issue_priority,    8, v_nina,   v_admin, NULL),
        (v_api, 8, 'Export CSV des rapports',                (SELECT id FROM issue_statuses WHERE project_id=v_api AND name='Todo'),        (SELECT id FROM issue_types WHERE project_id=v_api AND name='Feature'), 'MEDIUM'::issue_priority, 3, NULL,     v_admin, NULL);

    -- OPS
    INSERT INTO issues (project_id, sequence_number, title, status_id, type_id, priority, story_points, assignee_id, reporter_id, completed_at) VALUES
        (v_ops, 1, 'Pipeline CI bloquante sur les tests',    (SELECT id FROM issue_statuses WHERE project_id=v_ops AND name='Done'),        (SELECT id FROM issue_types WHERE project_id=v_ops AND name='Task'),    'HIGH'::issue_priority,   5, v_tom,   v_admin, NOW() - INTERVAL '5 days'),
        (v_ops, 2, 'Dockerfile multi-stage backend',         (SELECT id FROM issue_statuses WHERE project_id=v_ops AND name='Done'),        (SELECT id FROM issue_types WHERE project_id=v_ops AND name='Task'),    'MEDIUM'::issue_priority, 3, v_tom,   v_admin, NOW() - INTERVAL '8 days'),
        (v_ops, 3, 'Helm chart pour le déploiement',         (SELECT id FROM issue_statuses WHERE project_id=v_ops AND name='In Progress'), (SELECT id FROM issue_types WHERE project_id=v_ops AND name='Feature'), 'MEDIUM'::issue_priority, 8, v_tom,   v_admin, NULL),
        (v_ops, 4, 'Monitoring Prometheus + Grafana',        (SELECT id FROM issue_statuses WHERE project_id=v_ops AND name='Todo'),        (SELECT id FROM issue_types WHERE project_id=v_ops AND name='Feature'), 'MEDIUM'::issue_priority, 5, NULL,    v_admin, NULL),
        (v_ops, 5, 'Secrets management (Vault)',             (SELECT id FROM issue_statuses WHERE project_id=v_ops AND name='Backlog'),     (SELECT id FROM issue_types WHERE project_id=v_ops AND name='Feature'), 'LOW'::issue_priority,    8, NULL,    v_admin, NULL),
        (v_ops, 6, 'Auto-scaling des pods',                  (SELECT id FROM issue_statuses WHERE project_id=v_ops AND name='Backlog'),     (SELECT id FROM issue_types WHERE project_id=v_ops AND name='Feature'), 'LOW'::issue_priority,    5, NULL,    v_admin, NULL);

    -- Compteurs de séquence (dernier numéro utilisé par projet)
    INSERT INTO issue_sequence_counters (project_id, last_number) VALUES
        (v_web, 8), (v_api, 8), (v_ops, 6);

    -- ----------------------------------------------------------------
    -- 8. Labels sur les issues (matching skills ↔ labels pour Smart Assign)
    -- ----------------------------------------------------------------
    INSERT INTO issue_label_assignments (issue_id, label_id)
    SELECT i.id, l.id
    FROM issues i
    JOIN project_labels l ON l.project_id = i.project_id
    WHERE i.project_id = v_web AND (i.sequence_number, l.name) IN (
        (1,'react'),(1,'ui'),(2,'react'),(2,'css'),(3,'react'),(3,'typescript'),
        (4,'css'),(4,'ui'),(5,'react'),(5,'ui'),(6,'testing'),(7,'ui'),(7,'design'),(8,'react'),(8,'css'));

    INSERT INTO issue_label_assignments (issue_id, label_id)
    SELECT i.id, l.id
    FROM issues i
    JOIN project_labels l ON l.project_id = i.project_id
    WHERE i.project_id = v_api AND (i.sequence_number, l.name) IN (
        (1,'java'),(1,'api'),(2,'java'),(2,'sql'),(3,'java'),(3,'api'),
        (4,'java'),(4,'api'),(5,'sql'),(6,'java'),(6,'testing'),(7,'api'),(8,'java'),(8,'api'));

    INSERT INTO issue_label_assignments (issue_id, label_id)
    SELECT i.id, l.id
    FROM issues i
    JOIN project_labels l ON l.project_id = i.project_id
    WHERE i.project_id = v_ops AND (i.sequence_number, l.name) IN (
        (1,'ci-cd'),(2,'docker'),(3,'kubernetes'),(3,'infra'),(4,'infra'),(5,'infra'),(5,'kubernetes'),(6,'kubernetes'));

    -- ----------------------------------------------------------------
    -- 9. Équipes + association aux projets (PROD-3.6)
    -- ----------------------------------------------------------------
    INSERT INTO teams (workspace_id, created_by, name, description, emoji, color)
    VALUES (v_ws, v_admin, 'Frontend Guild', 'UI, design system, web app', '🎨', 'bg-violet-500') RETURNING id INTO v_tf_front;
    INSERT INTO teams (workspace_id, created_by, name, description, emoji, color)
    VALUES (v_ws, v_admin, 'Backend Guild', 'API, data, perf', '⚙️', 'bg-blue-500') RETURNING id INTO v_tf_back;
    INSERT INTO teams (workspace_id, created_by, name, description, emoji, color)
    VALUES (v_ws, v_admin, 'Platform & QA', 'Infra, CI/CD, qualité', '🚀', 'bg-emerald-500') RETURNING id INTO v_tf_plat;

    INSERT INTO team_members (team_id, user_id, role) VALUES
        (v_tf_front, v_sarah, 'LEAD'), (v_tf_front, v_aicha, 'MEMBER'), (v_tf_front, v_diego, 'MEMBER'), (v_tf_front, v_lina, 'MEMBER'),
        (v_tf_back,  v_marcus,'LEAD'), (v_tf_back,  v_aicha, 'MEMBER'), (v_tf_back,  v_nina, 'MEMBER'),
        (v_tf_plat,  v_tom,   'LEAD'), (v_tf_plat,  v_omar,  'MEMBER');

    INSERT INTO project_teams (project_id, team_id) VALUES
        (v_web, v_tf_front), (v_api, v_tf_back), (v_ops, v_tf_plat);

    -- ----------------------------------------------------------------
    -- 10. Historique d'assignations (alimente le score historique — PROD-1.8 Phase 1)
    --     Sarah/Marcus/Tom = bon historique ; Aïcha = mitigé ; Diego = en apprentissage.
    -- ----------------------------------------------------------------
    INSERT INTO assignment_events (workspace_id, issue_id, assignee_user_id, assigned_by_user_id, decision_source, accepted, resolved_successfully)
    VALUES
        (v_ws, (SELECT id FROM issues WHERE project_id=v_web AND sequence_number=1), v_sarah,  v_admin, 'SMART_ASSIGN', true, true),
        (v_ws, NULL,                                                                 v_sarah,  v_admin, 'MANUAL',       true, true),
        (v_ws, NULL,                                                                 v_sarah,  v_admin, 'SMART_ASSIGN', true, true),
        (v_ws, (SELECT id FROM issues WHERE project_id=v_api AND sequence_number=1), v_marcus, v_admin, 'SMART_ASSIGN', true, true),
        (v_ws, (SELECT id FROM issues WHERE project_id=v_api AND sequence_number=2), v_marcus, v_admin, 'MANUAL',       true, true),
        (v_ws, NULL,                                                                 v_marcus, v_admin, 'SMART_ASSIGN', true, true),
        (v_ws, (SELECT id FROM issues WHERE project_id=v_web AND sequence_number=2), v_aicha,  v_admin, 'SMART_ASSIGN', true, true),
        (v_ws, NULL,                                                                 v_aicha,  v_admin, 'SMART_ASSIGN', true, false),
        (v_ws, (SELECT id FROM issues WHERE project_id=v_ops AND sequence_number=1), v_tom,    v_admin, 'SMART_ASSIGN', true, true),
        (v_ws, (SELECT id FROM issues WHERE project_id=v_ops AND sequence_number=2), v_tom,    v_admin, 'MANUAL',       true, true),
        (v_ws, NULL,                                                                 v_omar,   v_admin, 'MANUAL',       true, true),
        (v_ws, NULL,                                                                 v_diego,  v_admin, 'SMART_ASSIGN', true, false);

    RAISE NOTICE 'Seed terminé : workspace "taskforce-demo" (id=%) avec 8 coéquipiers, 3 projets, 22 issues, 3 équipes.', v_ws;
END
$seed$;
