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
    -- enrichissement QA
    v_parent_web  BIGINT;
    v_cycle_active BIGINT;
    -- générateur de volume (issues étalées sur plusieurs semaines)
    v_proj           BIGINT;
    v_seq            INT;
    v_created        TIMESTAMP;
    v_done           TIMESTAMP;
    v_members        BIGINT[];
    v_done_status    BIGINT;
    v_todo_status    BIGINT;
    v_prog_status    BIGINT;
    v_backlog_status BIGINT;
    v_task_type      BIGINT;
    v_prio           issue_priority;
    i                INT;
    -- solos (contributeurs « loup solitaire » : membres du workspace, hors équipe)
    v_solo        BIGINT;
    v_solo_proj   BIGINT;
    v_solo_done   BIGINT;
    v_solo_todo   BIGINT;
    v_solo_prog   BIGINT;
    v_solo_backlog BIGINT;
    v_solo_task   BIGINT;
    v_solo_ids    BIGINT[];
    v_first       TEXT;
    v_last        TEXT;
    v_email       TEXT;
    v_name        TEXT;
    j             INT;
    v_firsts      TEXT[] := ARRAY['Léa','Hugo','Maya','Noah','Ivan','Sofia','Liam','Zoé','Adam','Nora','Elias','Jade','Yuki','Owen','Priya','Mateo','Anya','Kofi','Ines','Theo','Lucas','Amara','Felix','Rania'];
    v_lasts       TEXT[] := ARRAY['Moreau','Nakamura','Okafor','Rossi','Ivanov','Garcia','Murphy','Dubois','Khan','Bergström','Costa','Haddad','Tanaka','Schmidt','Patel','Lopez','Petrov','Mensah','Fontaine','Andersson','Silva','Diop','Weber','Nasser'];
    v_skillsets   TEXT[] := ARRAY['["react","typescript"]','["java","sql"]','["python","data"]','["docker","infra"]','["design","ui"]','["testing","qa"]'];
    v_seniorities TEXT[] := ARRAY['JUNIOR','MID','SENIOR'];
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
    -- Données non rattachées au workspace (purge re-run dédiée)
    DELETE FROM subscription_history WHERE stripe_event_id LIKE 'seed_%';
    DELETE FROM enterprise_inquiries WHERE email LIKE '%@seedlead.example';

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

    -- ================================================================
    -- ENRICHISSEMENT QA — couvre tous les écrans / détails
    -- ================================================================

    -- 11. Descriptions + dates sur des issues existantes (détail + indicateurs board)
    UPDATE issues SET description = 'Repenser la page d''accueil selon la nouvelle identité visuelle (maquettes Figma de Lina).',
        start_date = CURRENT_DATE - 8, due_date = CURRENT_DATE - 2
        WHERE project_id = v_web AND sequence_number = 3;
    UPDATE issues SET description = 'Le dark mode ne s''applique pas correctement aux cartes du dashboard.',
        due_date = CURRENT_DATE + 1
        WHERE project_id = v_web AND sequence_number = 4;
    UPDATE issues SET description = 'Rate limiting (bucket4j) sur /api/auth pour contrer le brute force.',
        start_date = CURRENT_DATE - 1, due_date = CURRENT_DATE + 10
        WHERE project_id = v_api AND sequence_number = 4;
    UPDATE issues SET description = 'Prometheus + Grafana pour le monitoring des pods.', due_date = CURRENT_DATE + 5
        WHERE project_id = v_ops AND sequence_number = 4;

    -- 12. Nouvelles issues WEB : URGENT en retard, Cancelled, épopée + sous-tâches
    INSERT INTO issues (project_id, sequence_number, title, description, status_id, type_id, priority, story_points, assignee_id, reporter_id, due_date) VALUES
        (v_web, 9, 'URGENT : connexion en production cassée', 'Plus aucune connexion possible depuis le déploiement de ce matin — régression critique.',
            (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='In Progress'), (SELECT id FROM issue_types WHERE project_id=v_web AND name='Bug'),
            'URGENT'::issue_priority, 5, v_sarah, v_admin, CURRENT_DATE - 1),
        (v_web, 10, 'Ancien widget météo (abandonné)', 'Feature abandonnée suite à la réorientation produit.',
            (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='Cancelled'), (SELECT id FROM issue_types WHERE project_id=v_web AND name='Feature'),
            'LOW'::issue_priority, 3, NULL, v_admin, NULL);

    INSERT INTO issues (project_id, sequence_number, title, description, status_id, type_id, priority, story_points, assignee_id, reporter_id)
        VALUES (v_web, 11, 'Épopée : refonte du design system', 'Chantier transverse : tokens, composants, doc Storybook.',
            (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='Todo'), (SELECT id FROM issue_types WHERE project_id=v_web AND name='Feature'),
            'HIGH'::issue_priority, 13, v_sarah, v_admin)
        RETURNING id INTO v_parent_web;

    INSERT INTO issues (project_id, sequence_number, title, status_id, type_id, priority, story_points, assignee_id, reporter_id, parent_id) VALUES
        (v_web, 12, 'Design tokens (couleurs, espacements)', (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='Todo'),    (SELECT id FROM issue_types WHERE project_id=v_web AND name='Task'), 'MEDIUM'::issue_priority, 3, v_diego, v_admin, v_parent_web),
        (v_web, 13, 'Composants Button/Input unifiés',       (SELECT id FROM issue_statuses WHERE project_id=v_web AND name='Backlog'), (SELECT id FROM issue_types WHERE project_id=v_web AND name='Task'), 'MEDIUM'::issue_priority, 5, NULL,    v_admin, v_parent_web);

    UPDATE issue_sequence_counters SET last_number = 13 WHERE project_id = v_web;

    INSERT INTO issue_label_assignments (issue_id, label_id)
    SELECT i.id, l.id FROM issues i JOIN project_labels l ON l.project_id = i.project_id
    WHERE i.project_id = v_web AND (i.sequence_number, l.name) IN ((9,'react'),(9,'ui'),(11,'ui'),(11,'design'),(12,'css'),(13,'react'));

    -- 13. Commentaires (dont une @mention) + checklist + relations + worklogs
    INSERT INTO issue_comments (issue_id, author_id, content) VALUES
        ((SELECT id FROM issues WHERE project_id=v_web AND sequence_number=3), v_sarah, 'Première version poussée, à relire.'),
        ((SELECT id FROM issues WHERE project_id=v_web AND sequence_number=3), v_admin, '@diego.santos peux-tu regarder les tokens stp ?'),
        ((SELECT id FROM issues WHERE project_id=v_web AND sequence_number=9), v_sarah, 'Rollback fait, je cherche la cause racine.'),
        ((SELECT id FROM issues WHERE project_id=v_api AND sequence_number=3), v_marcus, 'Webhook signature vérifiée, reste l''idempotence.');

    INSERT INTO issue_checklist_items (issue_id, content, is_done, position) VALUES
        ((SELECT id FROM issues WHERE project_id=v_web AND sequence_number=3), 'Maquettes validées',       true,  0),
        ((SELECT id FROM issues WHERE project_id=v_web AND sequence_number=3), 'Intégration responsive',    false, 1),
        ((SELECT id FROM issues WHERE project_id=v_web AND sequence_number=3), 'Tests visuels cross-browser',false, 2);

    INSERT INTO issue_relations (source_id, target_id, relation_type, created_by) VALUES
        ((SELECT id FROM issues WHERE project_id=v_web AND sequence_number=9), (SELECT id FROM issues WHERE project_id=v_web AND sequence_number=3), 'BLOCKS'::issue_relation_type, v_admin),
        ((SELECT id FROM issues WHERE project_id=v_web AND sequence_number=5), (SELECT id FROM issues WHERE project_id=v_web AND sequence_number=11), 'RELATES_TO'::issue_relation_type, v_admin);

    INSERT INTO issue_worklogs (issue_id, user_id, minutes, description, logged_at) VALUES
        ((SELECT id FROM issues WHERE project_id=v_web AND sequence_number=1), v_sarah,  180, 'Maquettes + intégration', CURRENT_DATE - 6),
        ((SELECT id FROM issues WHERE project_id=v_web AND sequence_number=3), v_sarah,  240, 'Base du composant DataTable', CURRENT_DATE - 1),
        ((SELECT id FROM issues WHERE project_id=v_web AND sequence_number=3), v_diego,   90, 'Aide sur le responsive', CURRENT_DATE),
        ((SELECT id FROM issues WHERE project_id=v_api AND sequence_number=2), v_marcus, 300, 'Investigation N+1 + correctif', CURRENT_DATE - 3),
        ((SELECT id FROM issues WHERE project_id=v_ops AND sequence_number=1), v_tom,    150, 'Debug pipeline CI', CURRENT_DATE - 5);

    -- 14. Cycles (sprints) + issues du sprint actif (burndown)
    INSERT INTO cycles (project_id, name, description, start_date, end_date, status, created_by) VALUES
        (v_web, 'Sprint 1 — Fondations', 'Mise en place initiale', CURRENT_DATE - 20, CURRENT_DATE - 6, 'COMPLETED'::cycle_status, v_admin);
    INSERT INTO cycles (project_id, name, description, start_date, end_date, status, created_by)
        VALUES (v_web, 'Sprint 2 — Dashboard', 'Refonte dashboard + dark mode', CURRENT_DATE - 5, CURRENT_DATE + 9, 'ACTIVE'::cycle_status, v_admin)
        RETURNING id INTO v_cycle_active;
    INSERT INTO cycles (project_id, name, description, start_date, end_date, status, created_by) VALUES
        (v_web, 'Sprint 3 — Profil & accessibilité', NULL, CURRENT_DATE + 10, CURRENT_DATE + 24, 'DRAFT'::cycle_status, v_admin);

    INSERT INTO cycle_issues (cycle_id, issue_id, added_by)
    SELECT v_cycle_active, i.id, v_admin FROM issues i
    WHERE i.project_id = v_web AND i.sequence_number IN (3, 4, 5, 12, 13);

    -- 15. Notifications (inbox) — pour l'admin, types variés, mix lu/non-lu
    INSERT INTO notifications (recipient_id, workspace_id, actor_id, type, urgency, read, title, body, issue_identifier, project_name) VALUES
        (v_admin, v_ws, v_sarah,  'assigned',      'info',     false, 'Nouvelle assignation', 'Sarah vous a assigné WEB-9',                'WEB-9', 'Web Application'),
        (v_admin, v_ws, v_admin,  'mention',       'info',     false, 'Vous avez été mentionné', 'Mention sur WEB-3',                       'WEB-3', 'Web Application'),
        (v_admin, v_ws, v_marcus, 'commented',     'info',     true,  'Nouveau commentaire', 'Marcus a commenté API-3',                    'API-3', 'API Platform'),
        (v_admin, v_ws, NULL,     'dueSoon',       'warning',  false, 'Échéance proche', 'WEB-4 arrive à échéance demain',                 'WEB-4', 'Web Application'),
        (v_admin, v_ws, NULL,     'overdue',       'critical', false, 'Issue en retard', 'WEB-3 est en retard',                            'WEB-3', 'Web Application'),
        (v_admin, v_ws, v_tom,    'statusChanged', 'info',     true,  'Changement de statut', 'OPS-1 marquée Done',                        'OPS-1', 'Infrastructure'),
        (v_admin, v_ws, NULL,     'overload',      'warning',  false, 'Surcharge détectée', 'Sarah a beaucoup de tâches ouvertes',         NULL,    NULL);

    -- 16. Favoris projet + pages (doc projet) + invitations en attente
    INSERT INTO project_favorites (user_id, project_id) VALUES (v_admin, v_web), (v_admin, v_api);

    INSERT INTO pages (project_id, created_by, title, emoji, content) VALUES
        (v_web, v_admin, 'Spécifications produit', '📘', 'Vision, personas, parcours clés, métriques de succès.'),
        (v_web, v_sarah, 'Guide du design system', '🎨', 'Tokens, composants, règles d''accessibilité, do/don''t.');

    INSERT INTO workspace_invitations (workspace_id, invited_by, email, role, token, status, expires_at) VALUES
        (v_ws, v_admin, 'nouvelle.recrue@example.com', 'MEMBER', 'seed-invite-token-001', 'PENDING', NOW() + INTERVAL '7 days'),
        (v_ws, v_admin, 'consultant.ext@example.com',  'ADMIN',  'seed-invite-token-002', 'PENDING', NOW() + INTERVAL '14 days');

    -- 17. Abonnement Stripe (admin PRO) + historique — pour la page Billing (sans Stripe réel)
    UPDATE users SET stripe_customer_id = 'cus_seed_admin' WHERE id = v_admin;
    INSERT INTO subscriptions (user_id, plan_type, status, stripe_customer_id, stripe_subscription_id, stripe_price_id,
                               amount, currency, billing_interval, current_period_start, current_period_end, started_at)
    VALUES (v_admin, 'PRO', 'ACTIVE'::plan_status, 'cus_seed_admin', 'sub_seed_admin', 'price_seed_pro',
            12.00, 'EUR', 'month', NOW() - INTERVAL '10 days', NOW() + INTERVAL '20 days', NOW() - INTERVAL '40 days')
    ON CONFLICT (user_id) DO UPDATE SET plan_type = EXCLUDED.plan_type, status = EXCLUDED.status,
        stripe_customer_id = EXCLUDED.stripe_customer_id, stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end;

    INSERT INTO subscription_history (user_id, plan_type, plan_status, stripe_subscription_id, stripe_event_id, stripe_invoice_id, amount_paid, currency, event_type, event_data, period_start, period_end) VALUES
        (v_admin, 'PRO', 'ACTIVE'::plan_status, 'sub_seed_admin', 'seed_evt_checkout', NULL,        NULL,  'EUR', 'checkout.session.completed', '{"seed":true}'::jsonb, NOW() - INTERVAL '40 days', NOW() - INTERVAL '10 days'),
        (v_admin, 'PRO', 'ACTIVE'::plan_status, 'sub_seed_admin', 'seed_evt_invoice1', 'in_seed_1', 12.00, 'EUR', 'invoice.payment_succeeded', '{"seed":true}'::jsonb, NOW() - INTERVAL '10 days', NOW() + INTERVAL '20 days');

    -- 18. Demandes Enterprise (sales/admin)
    INSERT INTO enterprise_inquiries (full_name, email, team_size, message, status) VALUES
        ('Claire Dubois', 'claire.dubois@seedlead.example', '51-200', 'Nous cherchons une solution pour 80 personnes avec SSO.', 'NEW'),
        ('Yann Leroy',    'yann.leroy@seedlead.example',    '11-50',  'Intéressé par le plan Enterprise, un rappel serait apprécié.', 'CONTACTED');

    -- ================================================================
    -- 19. VOLUME — ~90 issues étalées sur ~9 semaines (par projet).
    --     Alimente : throughput (created_at/completed_at par semaine),
    --     KPIs (cycle time/vélocité), capacité (issues ouvertes/membre),
    --     et un board bien rempli. created_at est surchargé explicitement.
    -- ================================================================
    FOREACH v_proj IN ARRAY ARRAY[v_web, v_api, v_ops] LOOP
        SELECT id INTO v_done_status    FROM issue_statuses WHERE project_id = v_proj AND name = 'Done';
        SELECT id INTO v_todo_status    FROM issue_statuses WHERE project_id = v_proj AND name = 'Todo';
        SELECT id INTO v_prog_status    FROM issue_statuses WHERE project_id = v_proj AND name = 'In Progress';
        SELECT id INTO v_backlog_status FROM issue_statuses WHERE project_id = v_proj AND name = 'Backlog';
        SELECT id INTO v_task_type      FROM issue_types    WHERE project_id = v_proj AND name = 'Task';
        SELECT COALESCE(MAX(sequence_number), 0) INTO v_seq FROM issues WHERE project_id = v_proj;
        SELECT array_agg(user_id) INTO v_members FROM project_members WHERE project_id = v_proj;

        FOR i IN 1..30 LOOP
            v_seq := v_seq + 1;
            -- création répartie de ~60 jours (i=1) à ~2 jours (i=30)
            v_created := NOW() - (INTERVAL '1 day' * (62 - i * 2));
            v_prio := (ARRAY['LOW','MEDIUM','MEDIUM','HIGH','LOW']::issue_priority[])[1 + (i % 5)];

            IF (i % 3) <> 0 THEN
                -- ~2/3 résolues : completed_at quelques jours après création, borné à maintenant
                v_done := LEAST(v_created + (INTERVAL '1 day' * (2 + (i % 6))), NOW() - INTERVAL '1 hour');
                INSERT INTO issues (project_id, sequence_number, title, description, status_id, type_id, priority, story_points, assignee_id, reporter_id, created_at, completed_at)
                VALUES (v_proj, v_seq, 'Itération #' || v_seq, 'Tâche de backlog livrée durant le cycle.',
                        v_done_status, v_task_type, v_prio, 1 + (i % 8),
                        v_members[1 + (i % array_length(v_members, 1))], v_admin, v_created, v_done);
            ELSE
                -- ~1/3 ouvertes : Backlog / Todo / In Progress en rotation ; ~1/4 non assignée (Smart Assign)
                INSERT INTO issues (project_id, sequence_number, title, description, status_id, type_id, priority, story_points, assignee_id, reporter_id, created_at)
                VALUES (v_proj, v_seq, 'Itération #' || v_seq, 'Tâche planifiée.',
                        CASE ((i / 3) % 3) WHEN 0 THEN v_backlog_status WHEN 1 THEN v_todo_status ELSE v_prog_status END,
                        v_task_type, v_prio, 1 + (i % 8),
                        CASE WHEN (i % 4) = 0 THEN NULL ELSE v_members[1 + (i % array_length(v_members, 1))] END,
                        v_admin, v_created);
            END IF;
        END LOOP;

        UPDATE issue_sequence_counters SET last_number = v_seq WHERE project_id = v_proj;
    END LOOP;

    -- Burndown : rattacher au sprint actif les issues WEB complétées dans sa fenêtre
    INSERT INTO cycle_issues (cycle_id, issue_id, added_by)
    SELECT v_cycle_active, i.id, v_admin FROM issues i
    WHERE i.project_id = v_web AND i.completed_at IS NOT NULL
      AND i.completed_at >= (CURRENT_DATE - 5)::timestamp
      AND NOT EXISTS (SELECT 1 FROM cycle_issues ci WHERE ci.cycle_id = v_cycle_active AND ci.issue_id = i.id);

    -- 20. Notifications supplémentaires (inbox en volume, mix lu/non-lu)
    INSERT INTO notifications (recipient_id, workspace_id, actor_id, type, urgency, read, title, body, issue_identifier, project_name) VALUES
        (v_admin, v_ws, v_marcus, 'assigned',      'info',     false, 'Nouvelle assignation', 'Marcus vous a assigné API-3',        'API-3', 'API Platform'),
        (v_admin, v_ws, v_aicha,  'commented',     'info',     false, 'Nouveau commentaire',  'Aïcha a commenté WEB-3',             'WEB-3', 'Web Application'),
        (v_admin, v_ws, v_nina,   'mention',       'info',     false, 'Mention',              'Nina vous a mentionné sur API-7',    'API-7', 'API Platform'),
        (v_admin, v_ws, NULL,     'dueSoon',       'warning',  false, 'Échéance proche',      'Une tâche arrive à échéance',        'OPS-4', 'Infrastructure'),
        (v_admin, v_ws, NULL,     'overdue',       'critical', false, 'Issue en retard',      'WEB-9 est en retard',                'WEB-9', 'Web Application'),
        (v_admin, v_ws, v_tom,    'completed',     'info',     true,  'Tâche terminée',       'Tom a terminé OPS-2',                'OPS-2', 'Infrastructure'),
        (v_admin, v_ws, v_sarah,  'statusChanged', 'info',     true,  'Changement de statut', 'WEB-1 marquée Done',                 'WEB-1', 'Web Application'),
        (v_admin, v_ws, v_diego,  'assigned',      'low',      false, 'Nouvelle assignation', 'Diego a pris WEB-12',                'WEB-12','Web Application');

    -- 21. Pages & worklogs supplémentaires (volume doc / temps passé)
    INSERT INTO pages (project_id, created_by, title, emoji, content) VALUES
        (v_api, v_marcus, 'Architecture API',     '🏗️', 'Couches, conventions REST, ApiResponse<T>, sécurité.'),
        (v_ops, v_tom,    'Runbook déploiement',  '🚀', 'Étapes de release, rollback, checklist post-deploy.'),
        (v_web, v_lina,   'Charte UI / tokens',   '🎨', 'Palette, typographie, espacements, composants.');

    -- ================================================================
    -- 22. SOLOS — 24 contributeurs « loup solitaire » : membres du workspace
    --     mais d'AUCUNE équipe. Projet dédié « Solo Initiatives » + ~150 issues
    --     étalées sur les 30 derniers jours → gonfle membres, capacité,
    --     throughput JOURNALIER (courbe 1 mois) et tous les KPIs.
    -- ================================================================
    INSERT INTO projects (workspace_id, name, identifier, description, created_by, color, icon_url)
    VALUES (v_ws, 'Solo Initiatives', 'SOLO', 'Initiatives portées en autonomie par des contributeurs solo.', v_admin, 'bg-amber-500', 'lucide:User')
    RETURNING id INTO v_solo_proj;

    INSERT INTO issue_statuses (project_id, name, color, category, position, is_default) VALUES
        (v_solo_proj, 'Backlog',     '#94a3b8', 'BACKLOG'::issue_status_category,    0, false),
        (v_solo_proj, 'Todo',        '#6366f1', 'UNSTARTED'::issue_status_category,  1, true),
        (v_solo_proj, 'In Progress', '#f59e0b', 'STARTED'::issue_status_category,    2, false),
        (v_solo_proj, 'Done',        '#10b981', 'COMPLETED'::issue_status_category,  3, false),
        (v_solo_proj, 'Cancelled',   '#ef4444', 'CANCELLED'::issue_status_category,  4, false);
    INSERT INTO issue_types (project_id, name, color, icon, is_default) VALUES
        (v_solo_proj, 'Task',    '#6366f1', 'circle-dot', true),
        (v_solo_proj, 'Bug',     '#ef4444', 'bug',        false),
        (v_solo_proj, 'Feature', '#10b981', 'zap',        false);
    INSERT INTO project_labels (project_id, name, color) VALUES
        (v_solo_proj, 'react', '#06b6d4'), (v_solo_proj, 'java', '#ef4444'),
        (v_solo_proj, 'data', '#8b5cf6'), (v_solo_proj, 'infra', '#10b981');

    SELECT id INTO v_solo_done    FROM issue_statuses WHERE project_id=v_solo_proj AND name='Done';
    SELECT id INTO v_solo_todo    FROM issue_statuses WHERE project_id=v_solo_proj AND name='Todo';
    SELECT id INTO v_solo_prog    FROM issue_statuses WHERE project_id=v_solo_proj AND name='In Progress';
    SELECT id INTO v_solo_backlog FROM issue_statuses WHERE project_id=v_solo_proj AND name='Backlog';
    SELECT id INTO v_solo_task    FROM issue_types    WHERE project_id=v_solo_proj AND name='Task';

    -- admin = LEAD du projet ; les solos = simples membres
    INSERT INTO project_members (project_id, user_id, role, added_by)
    VALUES (v_solo_proj, v_admin, 'LEAD'::project_role, NULL);

    v_solo_ids := ARRAY[]::BIGINT[];
    FOR j IN 1..24 LOOP
        v_first := v_firsts[j];
        v_last  := v_lasts[j];
        v_name  := v_first || ' ' || v_last;
        v_email := 'solo.' || LPAD(j::text, 2, '0') || '@seed.taskforce.dev';

        -- upsert par email (persiste entre re-runs comme les autres coéquipiers)
        INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active)
        VALUES ('seed-solo-' || LPAD(j::text, 2, '0'), v_email, v_name, 'FREE', true)
        ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
        RETURNING id INTO v_solo;
        v_solo_ids := array_append(v_solo_ids, v_solo);

        -- membre du workspace MAIS d'aucune team_members → « solo »
        INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
        VALUES (v_ws, v_solo, 'MEMBER', v_admin);

        -- profil de compétences (capacité 20→40h variée → KPI capacité d'équipe)
        INSERT INTO member_skill_profiles (workspace_id, user_id, profile_text, skills_json, capacity_hours_per_week, seniority)
        VALUES (v_ws, v_solo, 'Contributeur autonome.',
                v_skillsets[1 + (j % 6)]::jsonb,
                20 + ((j * 7) % 21),
                v_seniorities[1 + (j % 3)]);

        INSERT INTO project_members (project_id, user_id, role, added_by)
        VALUES (v_solo_proj, v_solo, 'MEMBER'::project_role, v_admin);
    END LOOP;

    -- ~150 issues solo réparties sur les 30 derniers jours, ~2/3 résolues
    v_seq := 0;
    FOR i IN 1..150 LOOP
        v_seq  := v_seq + 1;
        v_solo := v_solo_ids[1 + (i % 24)];
        v_created := NOW() - (INTERVAL '1 day' * (30 - (i % 30)));
        v_prio := (ARRAY['LOW','MEDIUM','MEDIUM','HIGH','URGENT']::issue_priority[])[1 + (i % 5)];

        IF (i % 3) <> 0 THEN
            v_done := LEAST(v_created + (INTERVAL '1 day' * (1 + (i % 4))), NOW() - INTERVAL '1 hour');
            INSERT INTO issues (project_id, sequence_number, title, description, status_id, type_id, priority, story_points, assignee_id, reporter_id, created_at, completed_at)
            VALUES (v_solo_proj, v_seq, 'Solo #' || v_seq, 'Initiative menée en autonomie.',
                    v_solo_done, v_solo_task, v_prio, 1 + (i % 5), v_solo, v_admin, v_created, v_done);
        ELSE
            INSERT INTO issues (project_id, sequence_number, title, description, status_id, type_id, priority, story_points, assignee_id, reporter_id, created_at)
            VALUES (v_solo_proj, v_seq, 'Solo #' || v_seq, 'Initiative planifiée.',
                    CASE ((i / 3) % 3) WHEN 0 THEN v_solo_backlog WHEN 1 THEN v_solo_todo ELSE v_solo_prog END,
                    v_solo_task, v_prio, 1 + (i % 5), v_solo, v_admin, v_created);
        END IF;
    END LOOP;
    INSERT INTO issue_sequence_counters (project_id, last_number) VALUES (v_solo_proj, v_seq);

    -- ================================================================
    -- 23. QA-1 (30/06) — DENSIFICATION des écrans « fins » : commentaires,
    --     worklogs et notifications en volume, pour exercer le détail d'issue,
    --     l'onglet Temps et l'inbox sur un jeu de données réaliste.
    -- ================================================================
    -- 23a. Commentaires — fil réaliste sur ~1 issue sur 3 du workspace (auteurs variés)
    INSERT INTO issue_comments (issue_id, author_id, content, created_at)
    SELECT i.id,
           (ARRAY[v_sarah, v_marcus, v_aicha, v_tom, v_omar, v_nina, v_diego])[1 + (i.id % 7)],
           (ARRAY[
             'Je prends, je regarde ça aujourd''hui.',
             'Bloqué par une dépendance externe, je remonte le sujet au daily.',
             'PR ouverte, review demandée 🙏',
             'Corrigé et déployé en staging, à valider de votre côté.',
             'Il manque un test sur ce cas limite, je complète.',
             'Reproduit en local, cause racine identifiée.',
             'On en reparle demain, besoin d''un avis produit.'
           ])[1 + (i.id % 7)],
           i.created_at + INTERVAL '3 hours'
    FROM issues i JOIN projects p ON p.id = i.project_id
    WHERE p.workspace_id = v_ws AND (i.id % 3) = 0;

    -- 23b. 2e commentaire (thread) sur ~1 issue sur 6 → conversations
    INSERT INTO issue_comments (issue_id, author_id, content, created_at)
    SELECT i.id,
           (ARRAY[v_admin, v_lina, v_marcus, v_sarah])[1 + (i.id % 4)],
           (ARRAY[
             'Merci, je valide dès que possible.',
             'Bien vu, on part sur cette approche.',
             'Attention à la rétro-compatibilité côté API.',
             'Ajouté au prochain sprint.'
           ])[1 + (i.id % 4)],
           i.created_at + INTERVAL '1 day'
    FROM issues i JOIN projects p ON p.id = i.project_id
    WHERE p.workspace_id = v_ws AND (i.id % 6) = 0;

    -- 23c. Worklogs — temps passé sur ~1 issue assignée sur 4 (onglet Temps)
    INSERT INTO issue_worklogs (issue_id, user_id, minutes, description, logged_at)
    SELECT i.id, i.assignee_id,
           30 * (1 + (i.id % 8)),
           (ARRAY['Développement','Investigation','Revue de code','Rédaction de tests','Correctif','Pairing'])[1 + (i.id % 6)],
           COALESCE(i.completed_at::date, (i.created_at + INTERVAL '1 day')::date)
    FROM issues i JOIN projects p ON p.id = i.project_id
    WHERE p.workspace_id = v_ws AND i.assignee_id IS NOT NULL AND (i.id % 4) = 0;

    -- 23d. Notifications — volume additionnel pour l'admin (inbox réaliste, mix lu/non-lu)
    INSERT INTO notifications (recipient_id, workspace_id, actor_id, type, urgency, read, title, body, issue_identifier, project_name)
    SELECT v_admin, v_ws,
           (ARRAY[v_sarah, v_marcus, v_aicha, v_tom, v_nina])[1 + (n % 5)],
           (ARRAY['assigned','commented','mention','statusChanged','completed'])[1 + (n % 5)],
           (ARRAY['info','info','info','low','info'])[1 + (n % 5)],
           (n % 4) = 0,
           (ARRAY['Nouvelle assignation','Nouveau commentaire','Mention','Changement de statut','Tâche terminée'])[1 + (n % 5)],
           'Activité sur votre workspace (#' || n || ')',
           'WEB-' || (1 + (n % 8)), 'Web Application'
    FROM generate_series(1, 20) AS n;

    -- =====================================================================
    -- 24. Chat natif — canaux, membres, messages (temps réel STOMP)
    -- =====================================================================
    DECLARE
        v_ch_general BIGINT;
        v_ch_random  BIGINT;
        v_ch_dev     BIGINT;
        v_ch_design  BIGINT;
    BEGIN
        INSERT INTO channels (workspace_id, kind, name, description, is_private, created_by)
        VALUES (v_ws, 'CHANNEL', 'general', 'Discussions générales de l''équipe.', false, v_admin)
        RETURNING id INTO v_ch_general;

        INSERT INTO channels (workspace_id, kind, name, description, is_private, created_by)
        VALUES (v_ws, 'CHANNEL', 'random', 'Hors-sujet, pauses café, GIFs.', false, v_admin)
        RETURNING id INTO v_ch_random;

        INSERT INTO channels (workspace_id, kind, name, description, is_private, created_by)
        VALUES (v_ws, 'CHANNEL', 'dev', 'Discussions techniques backend / frontend.', false, v_marcus)
        RETURNING id INTO v_ch_dev;

        INSERT INTO channels (workspace_id, kind, name, description, is_private, created_by)
        VALUES (v_ws, 'CHANNEL', 'design', 'Design system, maquettes, UI/UX.', false, v_lina)
        RETURNING id INTO v_ch_design;

        -- Membres : toute l'équipe sur general/random ; sous-groupes sur dev/design
        INSERT INTO channel_members (channel_id, user_id)
        SELECT c.ch, u.usr
        FROM (VALUES (v_ch_general), (v_ch_random)) AS c(ch)
        CROSS JOIN (VALUES (v_admin),(v_sarah),(v_marcus),(v_aicha),(v_tom),(v_lina),(v_omar),(v_nina),(v_diego)) AS u(usr);

        INSERT INTO channel_members (channel_id, user_id) VALUES
            (v_ch_dev, v_admin), (v_ch_dev, v_marcus), (v_ch_dev, v_aicha), (v_ch_dev, v_tom), (v_ch_dev, v_nina), (v_ch_dev, v_diego),
            (v_ch_design, v_admin), (v_ch_design, v_sarah), (v_ch_design, v_lina), (v_ch_design, v_aicha);

        -- Historique de messages (createdAt étalés pour un rendu réaliste)
        INSERT INTO chat_messages (channel_id, author_id, content, created_at) VALUES
            (v_ch_general, v_admin,  'Bienvenue sur le workspace TaskForce HQ 👋', now() - INTERVAL '3 days'),
            (v_ch_general, v_sarah,  'Hello tout le monde ! Contente de démarrer 🎉', now() - INTERVAL '3 days' + INTERVAL '5 min'),
            (v_ch_general, v_marcus, 'On fait le point sprint à 14h ?', now() - INTERVAL '2 days'),
            (v_ch_general, v_tom,    'OK pour moi 👍', now() - INTERVAL '2 days' + INTERVAL '3 min'),
            (v_ch_dev,     v_marcus, 'La branche chore/integration est prête pour le chat temps réel.', now() - INTERVAL '1 day'),
            (v_ch_dev,     v_aicha,  'Nickel, le STOMP se connecte bien côté front.', now() - INTERVAL '1 day' + INTERVAL '12 min'),
            (v_ch_dev,     v_nina,   'Pensez à seed des canaux pour la démo 😉', now() - INTERVAL '20 hours'),
            (v_ch_design,  v_lina,   'Nouvelle version du design system dispo sur Figma.', now() - INTERVAL '6 hours'),
            (v_ch_design,  v_sarah,  'Super, je l''intègre cet après-midi.', now() - INTERVAL '5 hours'),
            (v_ch_random,  v_diego,  'Quelqu''un pour un café ? ☕', now() - INTERVAL '2 hours');
    END;

    -- ==================================================================
    -- Échéances réalistes — remplit la heatmap de charge (US-022) + les
    -- compteurs « en retard » / « échéance proche » du Decision Board.
    --
    -- RELATIVES à CURRENT_DATE : toujours pertinentes quel que soit le jour où
    -- le seed est rejoué (sinon des dates fixes tombent vite hors fenêtre).
    -- Ciblent EXACTEMENT ce que compte la heatmap : issues OUVERTES (statut hors
    -- COMPLETED/CANCELLED) et ASSIGNÉES. Étalées sur [-3 j, +13 j] → un mix
    -- réaliste de retards, d'échéances du jour et de la quinzaine à venir.
    -- ==================================================================
    UPDATE issues i
    SET due_date = CURRENT_DATE + ((((i.id * 7 + i.sequence_number * 3) % 17) - 3))::int
    FROM issue_statuses s
    WHERE i.status_id = s.id
      AND s.category::text NOT IN ('COMPLETED', 'CANCELLED')
      AND i.assignee_id IS NOT NULL
      AND i.project_id IN (SELECT id FROM projects WHERE workspace_id = v_ws);

    -- Start date cohérente là où elle manque (start ≤ due), pour un Gantt/roadmap lisible.
    UPDATE issues i
    SET start_date = LEAST(i.start_date, i.due_date - 2)
    FROM issue_statuses s
    WHERE i.status_id = s.id
      AND i.due_date IS NOT NULL
      AND (i.start_date IS NULL OR i.start_date > i.due_date)
      AND i.project_id IN (SELECT id FROM projects WHERE workspace_id = v_ws);

    -- ==================================================================
    -- Discussions (forum interne) — la table était vide ; on la remplit de fils
    -- réalistes : catégories et états variés, une épinglée, une verrouillée.
    -- ==================================================================
    INSERT INTO discussions (workspace_id, author_id, title, body, category, state, is_pinned, is_locked, reply_count, reaction_count, tags, created_at, updated_at) VALUES
      (v_ws, v_admin,  'Roadmap Q3 : priorités produit',              'On aligne les priorités du trimestre. Vos retours sur le focus « AI Delivery OS » ?',      'ANNOUNCEMENT', 'OPEN',     TRUE,  FALSE, 7, 12, 'roadmap,produit',    now() - INTERVAL '5 days',  now() - INTERVAL '2 hours'),
      (v_ws, v_sarah,  'Idée : mode focus sur le board',              'Un raccourci pour masquer les colonnes terminées pendant un sprint, ça vous parle ?',      'IDEA',         'OPEN',     FALSE, FALSE, 4,  8, 'ux,board',           now() - INTERVAL '4 days',  now() - INTERVAL '1 day'),
      (v_ws, v_marcus, 'Question : convention de nommage des branches','On part sur feature/*, fix/* — on ajoute chore/* pour la maintenance ?',                   'QUESTION',     'ANSWERED', FALSE, FALSE, 6,  3, 'git,convention',     now() - INTERVAL '6 days',  now() - INTERVAL '3 days'),
      (v_ws, v_nina,   'Show & Tell : explorateur de graphes IA',     'Démo du nouvel explorateur de graphes généré par l''IA sur la page Intelligence 🎉',       'SHOW',         'OPEN',     FALSE, FALSE, 9, 21, 'ia,analytics',       now() - INTERVAL '2 days',  now() - INTERVAL '4 hours'),
      (v_ws, v_tom,    'Post-mortem : incident déploiement',          'Retour sur l''incident de la semaine dernière et les actions correctives prises.',         'GENERAL',      'CLOSED',   FALSE, TRUE,  5,  6, 'infra,post-mortem',  now() - INTERVAL '8 days',  now() - INTERVAL '7 days'),
      (v_ws, v_lina,   'Design system : tokens de couleur',           'Proposition de palette pour les graphiques (emerald/blue/rose/indigo) — vos avis ?',        'IDEA',         'OPEN',     FALSE, FALSE, 3,  5, 'design,ui',          now() - INTERVAL '1 day',   now() - INTERVAL '6 hours');

    RAISE NOTICE 'Seed QA ULTRA-complet : workspace "taskforce-demo" (id=%) — 9 membres + 24 solos (hors équipe), 4 projets, ~267 issues (throughput JOURNALIER 30 j + hebdo, KPIs/capacité/burndown remplis), sous-tâches/URGENT/cancelled, commentaires, checklist, relations, worklogs (~70), 3 cycles + sprint actif peuplé, ~130 commentaires (fils), ~35 notifications (mix lu/non-lu), favoris, 5 pages, invitations, abonnement PRO + historique, demandes enterprise, ÉCHÉANCES réparties sur la quinzaine (heatmap de charge remplie).', v_ws;
END
$seed$;
