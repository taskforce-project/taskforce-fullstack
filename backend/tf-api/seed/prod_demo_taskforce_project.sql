-- =====================================================================
-- TaskForce - Projet demo "TaskForce" (issues REELLES) pour la soutenance
-- =====================================================================
-- Ajoute au workspace demo (slug 'demo', cf. prod_demo_seed.sql) un projet
-- "TaskForce" (identifier TF) rempli des chantiers REELLEMENT livres/en cours,
-- pour des screenshots + une video demo Smart Assign (style Linear/Raycast).
--
-- Volontaire : ~2/3 des issues assignees (aux coequipiers seed), le reste NON
-- assigne -> matiere pour la demo Smart Assign. Descriptions courtes + liens PR.
--
-- Idempotent : on purge le projet identifier='TF' du workspace demo puis on le
-- reconstruit. Prerequis : prod_demo_seed.sql applique (workspace 'demo' + seeds).
--
-- Lancer (VM1) :
--   docker exec -i taskforce-postgres-prod psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < prod_demo_taskforce_project.sql
-- =====================================================================

DO $tf$
DECLARE
    v_ws     BIGINT;
    v_owner  BIGINT;
    v_sarah  BIGINT;  -- Frontend lead
    v_marcus BIGINT;  -- Backend
    v_aicha  BIGINT;  -- Fullstack
    v_tom    BIGINT;  -- DevOps
    v_lina   BIGINT;  -- Designer
    v_nina   BIGINT;  -- Data / IA
    v_proj   BIGINT;
    v_backlog BIGINT; v_todo BIGINT; v_prog BIGINT; v_review BIGINT; v_done BIGINT; v_cancel BIGINT;
    v_task BIGINT; v_bug BIGINT; v_feat BIGINT;
    v_pr TEXT := 'https://github.com/taskforce-project/taskforce-fullstack/pull/';
BEGIN
    SELECT id, owner_id INTO v_ws, v_owner FROM workspaces WHERE slug = 'demo';
    IF v_ws IS NULL THEN
        RAISE EXCEPTION 'Workspace demo introuvable - lance d abord prod_demo_seed.sql';
    END IF;
    SELECT id INTO v_sarah  FROM users WHERE email = 'sarah.chen@seed.taskforce.dev';
    SELECT id INTO v_marcus FROM users WHERE email = 'marcus.webb@seed.taskforce.dev';
    SELECT id INTO v_aicha  FROM users WHERE email = 'aicha.diallo@seed.taskforce.dev';
    SELECT id INTO v_tom    FROM users WHERE email = 'tom.berg@seed.taskforce.dev';
    SELECT id INTO v_lina   FROM users WHERE email = 'lina.park@seed.taskforce.dev';
    SELECT id INTO v_nina   FROM users WHERE email = 'nina.volkov@seed.taskforce.dev';

    -- Reset idempotent du projet TF
    DELETE FROM projects WHERE workspace_id = v_ws AND identifier = 'TF';

    INSERT INTO projects (workspace_id, name, identifier, description, created_by, color, icon_url, growth_mode)
    VALUES (v_ws, 'TaskForce', 'TF',
            'Le produit TaskForce lui-meme : l AI Delivery OS. Suivi des chantiers reels (backend Spring, front Next.js, IA, infra).',
            v_owner, 'bg-blue-500', 'lucide:Rocket', true)
    RETURNING id INTO v_proj;

    INSERT INTO issue_statuses (project_id, name, color, category, position, is_default) VALUES
        (v_proj, 'Backlog',     '#94a3b8', 'BACKLOG'::issue_status_category,   0, false),
        (v_proj, 'Todo',        '#6366f1', 'UNSTARTED'::issue_status_category, 1, true),
        (v_proj, 'In Progress', '#f59e0b', 'STARTED'::issue_status_category,   2, false),
        (v_proj, 'In Review',   '#8b5cf6', 'STARTED'::issue_status_category,   3, false),
        (v_proj, 'Done',        '#10b981', 'COMPLETED'::issue_status_category, 4, false),
        (v_proj, 'Cancelled',   '#ef4444', 'CANCELLED'::issue_status_category, 5, false);
    SELECT id INTO v_backlog FROM issue_statuses WHERE project_id=v_proj AND name='Backlog';
    SELECT id INTO v_todo    FROM issue_statuses WHERE project_id=v_proj AND name='Todo';
    SELECT id INTO v_prog    FROM issue_statuses WHERE project_id=v_proj AND name='In Progress';
    SELECT id INTO v_review  FROM issue_statuses WHERE project_id=v_proj AND name='In Review';
    SELECT id INTO v_done    FROM issue_statuses WHERE project_id=v_proj AND name='Done';
    SELECT id INTO v_cancel  FROM issue_statuses WHERE project_id=v_proj AND name='Cancelled';

    INSERT INTO issue_types (project_id, name, color, icon, is_default) VALUES
        (v_proj, 'Task',    '#6366f1', 'circle-dot', true),
        (v_proj, 'Bug',     '#ef4444', 'bug',        false),
        (v_proj, 'Feature', '#10b981', 'zap',        false);
    SELECT id INTO v_task FROM issue_types WHERE project_id=v_proj AND name='Task';
    SELECT id INTO v_bug  FROM issue_types WHERE project_id=v_proj AND name='Bug';
    SELECT id INTO v_feat FROM issue_types WHERE project_id=v_proj AND name='Feature';

    INSERT INTO project_labels (project_id, name, color) VALUES
        (v_proj, 'backend',   '#ef4444'), (v_proj, 'frontend', '#06b6d4'),
        (v_proj, 'ia',        '#8b5cf6'), (v_proj, 'infra',    '#10b981'),
        (v_proj, 'securite',  '#f59e0b'), (v_proj, 'rgpd',     '#3b82f6'),
        (v_proj, 'billing',   '#ec4899'), (v_proj, 'ux',       '#f97316');

    INSERT INTO project_members (project_id, user_id, role, added_by) VALUES
        (v_proj, v_owner,  'LEAD'::project_role,   NULL),
        (v_proj, v_sarah,  'MEMBER'::project_role, v_owner),
        (v_proj, v_marcus, 'MEMBER'::project_role, v_owner),
        (v_proj, v_aicha,  'MEMBER'::project_role, v_owner),
        (v_proj, v_tom,    'MEMBER'::project_role, v_owner),
        (v_proj, v_nina,   'MEMBER'::project_role, v_owner);

    -- ================================================================
    -- Issues REELLES. ~2/3 assignees, le reste NON assigne (Smart Assign).
    -- reporter = owner. created_at etale sur ~7 semaines ; completed_at si Done.
    -- ================================================================
    INSERT INTO issues (project_id, sequence_number, title, description, status_id, type_id, priority, story_points, assignee_id, reporter_id, created_at, completed_at) VALUES
    (v_proj, 1,  'Auth : refresh token en cookie HttpOnly + rotation (OWASP A07)',
        'Access token court cote client, refresh en cookie HttpOnly/Secure/SameSite. Durcissement audit OWASP. PR ' || v_pr || '237',
        v_done, v_feat, 'URGENT'::issue_priority, 8, v_marcus, v_owner, NOW()-INTERVAL '46 days', NOW()-INTERVAL '43 days'),
    (v_proj, 2,  'Rate limiting auth (Redis) anti brute-force + CF-Connecting-IP',
        'Filtre avant Spring Security, distribue Redis, IP resolue via CF-Connecting-IP (anti-spoof). Profils login/register/OTP.',
        v_done, v_feat, 'HIGH'::issue_priority, 5, v_marcus, v_owner, NOW()-INTERVAL '44 days', NOW()-INTERVAL '41 days'),
    (v_proj, 3,  '2FA TOTP geree par l app (QR + etape code au login)',
        'TOTP dans notre DB (user_two_factor, V79), plus Keycloak. QR dans un dialog, verif au login, recovery codes.',
        v_done, v_feat, 'HIGH'::issue_priority, 8, v_marcus, v_owner, NOW()-INTERVAL '40 days', NOW()-INTERVAL '36 days'),
    (v_proj, 4,  'RGPD : suppression de compte + anonymisation (delai de grace)',
        'Auto-suppression -> anonymisation (deleted-N@anonymized.invalid), journal d audit conserve, purge par job apres delai.',
        v_done, v_feat, 'HIGH'::issue_priority, 8, v_marcus, v_owner, NOW()-INTERVAL '38 days', NOW()-INTERVAL '34 days'),
    (v_proj, 5,  'Smart Assign : scoring skills + charge + disponibilite',
        'Recommande le meilleur assigne par matching competences/labels, charge (points ouverts) et conges (member_leaves).',
        v_done, v_feat, 'HIGH'::issue_priority, 13, v_nina, v_owner, NOW()-INTERVAL '35 days', NOW()-INTERVAL '30 days'),
    (v_proj, 6,  'Brain OS : ingestion GitHub (issues/PR -> KnowledgeNode)',
        'Patron sync : lecture repo -> 1 KnowledgeNode par item (dedup metadata.externalId) + embed. PR ' || v_pr || '250',
        v_done, v_feat, 'MEDIUM'::issue_priority, 5, v_aicha, v_owner, NOW()-INTERVAL '33 days', NOW()-INTERVAL '30 days'),
    (v_proj, 7,  'Brain OS : ingestion Slack (historique canal -> KnowledgeNode)',
        'Mirror entrant d un canal Slack vers le Brain OS (NOTE/HISTORIQUE), auteur resolu, bruit filtre. PR ' || v_pr || '250',
        v_done, v_feat, 'MEDIUM'::issue_priority, 5, v_aicha, v_owner, NOW()-INTERVAL '32 days', NOW()-INTERVAL '29 days'),
    (v_proj, 8,  'Console MCP : 15 connecteurs, OAuth 1-clic, Cortex agentique',
        'Hote MCP Java-natif, outils armes sur intention deep, routage defaut-TaskForce. Bornage schemas (fix Groq 413).',
        v_done, v_feat, 'HIGH'::issue_priority, 13, v_nina, v_owner, NOW()-INTERVAL '30 days', NOW()-INTERVAL '24 days'),
    (v_proj, 9,  'Gating IA par plan : quota tokens/compte (429 upsell)',
        'IA metree par tokens PAR COMPTE (table ai_token_usage), plafonds calibres Groq. Depassement -> 409 upsell. PR ' || v_pr || '251',
        v_done, v_feat, 'HIGH'::issue_priority, 8, v_nina, v_owner, NOW()-INTERVAL '22 days', NOW()-INTERVAL '19 days'),
    (v_proj, 10, 'AiRateGuard : garde-debit IA par minute (429 + Retry-After)',
        'Fenetres-minute Redis globale (8000 TPM Groq) + par compte. Protege le pool LLM partage. PR ' || v_pr || '251',
        v_done, v_feat, 'HIGH'::issue_priority, 5, v_nina, v_owner, NOW()-INTERVAL '20 days', NOW()-INTERVAL '18 days'),
    (v_proj, 11, 'Billing Stripe : checkout + portail self-service + proration',
        'Plan applique via webhook (priceId -> PlanType). Upgrade/downgrade au portail, proration. Assistant Cortex des FREE.',
        v_done, v_feat, 'HIGH'::issue_priority, 8, v_aicha, v_owner, NOW()-INTERVAL '28 days', NOW()-INTERVAL '25 days'),
    (v_proj, 12, 'Webhook Stripe durci : anti-retrogradation (price-id ambigu -> null)',
        'getPlanForPriceId renvoie null si un price-id matche plusieurs forfaits -> pas de resync depuis un signal non fiable.',
        v_done, v_bug, 'MEDIUM'::issue_priority, 3, v_aicha, v_owner, NOW()-INTERVAL '26 days', NOW()-INTERVAL '24 days'),
    (v_proj, 13, 'Supervision Prometheus + Grafana + alertes Discord (VM2)',
        'Prometheus scrape les exporters VM1 via Tailscale ; 9 regles d alerte -> Discord. Grafana sur la VM2.',
        v_done, v_feat, 'MEDIUM'::issue_priority, 5, v_tom, v_owner, NOW()-INTERVAL '24 days', NOW()-INTERVAL '21 days'),
    (v_proj, 14, 'Dashboard produit Grafana (vues read-only, exclut la demo)',
        'Suivi utilisateurs/plans/inscriptions/activite via vues metrics.* + role grafana_ro (lecture seule, definer).',
        v_done, v_feat, 'MEDIUM'::issue_priority, 5, v_tom, v_owner, NOW()-INTERVAL '4 days', NOW()-INTERVAL '4 days'),
    (v_proj, 15, 'Deploiement 2 VM : auto-deploy systemd sur merge main',
        'Timer systemd poll origin/main, rebuild par role (.deploy-role), ff-only. Tunnel Cloudflare, TLS, Tailscale.',
        v_done, v_feat, 'HIGH'::issue_priority, 8, v_tom, v_owner, NOW()-INTERVAL '36 days', NOW()-INTERVAL '31 days'),
    (v_proj, 16, 'Onboarding wizard (competences -> Smart Assign)',
        'Wizard 4 etapes qui nourrit member_skill_profiles ; suggestion Cortex offerte. Refonte dans l app (OnboardingShell).',
        v_done, v_feat, 'MEDIUM'::issue_priority, 5, v_lina, v_owner, NOW()-INTERVAL '31 days', NOW()-INTERVAL '27 days'),
    (v_proj, 17, 'Cache Redis dashboard + cache des insights IA',
        'Agregats dashboard (@Cacheable TTL 5 min) + insights IA generes caches (unless mode=generated). Perf.',
        v_done, v_feat, 'MEDIUM'::issue_priority, 3, v_marcus, v_owner, NOW()-INTERVAL '18 days', NOW()-INTERVAL '16 days'),
    (v_proj, 18, 'Funnel landing : CTA vers l inscription (signup ouvert)',
        '46 CTA re-diriges de /waitlist vers /auth/register. Mentions legales + footer. PR ' || v_pr || '252',
        v_done, v_task, 'MEDIUM'::issue_priority, 3, v_sarah, v_owner, NOW()-INTERVAL '4 days', NOW()-INTERVAL '4 days'),
    (v_proj, 19, 'Durcissement pre-beta : faux-succes stores + etats loading/error',
        'Les stores avalent l erreur (retour null/false) -> brancher sur le retour, pas sur un catch mort. PR ' || v_pr || '252',
        v_done, v_bug, 'HIGH'::issue_priority, 5, v_sarah, v_owner, NOW()-INTERVAL '4 days', NOW()-INTERVAL '4 days'),
    (v_proj, 20, 'Editeur de doc collaboratif (TipTap) temps reel',
        'Pages projet editables facon Notion, sauvegarde + presence. Base posee, reste la collaboration live.',
        v_review, v_feat, 'MEDIUM'::issue_priority, 8, v_sarah, v_owner, NOW()-INTERVAL '9 days', NULL),
    (v_proj, 21, 'Pricing : reduction annuelle Business (Stripe + app + landing)',
        'Ajouter des price-ids annuels avec reduction, aligner l affichage et le checkout. Pas de reduction cote Business aujourd hui.',
        v_prog, v_feat, 'HIGH'::issue_priority, 5, NULL, v_owner, NOW()-INTERVAL '2 days', NULL),
    (v_proj, 22, 'Streaming SSE de l assistant Cortex (tokens Groq)',
        'Reponse token par token cote UI (au lieu d attendre la reponse complete). Meilleur ressenti sur les longues reponses.',
        v_todo, v_feat, 'MEDIUM'::issue_priority, 5, NULL, v_owner, NOW()-INTERVAL '12 days', NULL),
    (v_proj, 23, 'Capacite IA : Groq Dev tier ou Ollama (5+ users deep concurrents)',
        'Le 8000 TPM du tier gratuit ne tient pas 5 appels deep simultanes. Decision infra/budget a trancher.',
        v_todo, v_task, 'HIGH'::issue_priority, 3, NULL, v_owner, NOW()-INTERVAL '3 days', NULL),
    (v_proj, 24, 'Export / import de projet',
        'Exporter un projet (issues, statuts, membres) et le reimporter. Demande recurrente en onboarding equipe.',
        v_backlog, v_feat, 'LOW'::issue_priority, 8, NULL, v_owner, NOW()-INTERVAL '15 days', NULL),
    (v_proj, 25, 'RBAC granulaire via Keycloak',
        'Roles fins par ressource au-dela de OWNER/ADMIN/MEMBER/VIEWER. A cadrer avec le modele d autorisation actuel.',
        v_backlog, v_feat, 'MEDIUM'::issue_priority, 8, NULL, v_owner, NOW()-INTERVAL '17 days', NULL),
    (v_proj, 26, 'Bug : HMR front casse sous Docker Windows (restart requis)',
        'Next dev ne hot-reload pas sous Windows/Docker -> docker restart apres chaque change. Confort DX a regler.',
        v_backlog, v_bug, 'LOW'::issue_priority, 2, NULL, v_owner, NOW()-INTERVAL '20 days', NULL),
    (v_proj, 27, 'Ancien widget d essai (abandonne)',
        'Piste ecartee suite a la reorientation produit.',
        v_cancel, v_task, 'LOW'::issue_priority, 2, NULL, v_owner, NOW()-INTERVAL '25 days', NULL);

    INSERT INTO issue_sequence_counters (project_id, last_number) VALUES (v_proj, 27);

    -- Labels sur les issues (matching skills <-> labels pour Smart Assign + lisibilite board)
    INSERT INTO issue_label_assignments (issue_id, label_id)
    SELECT i.id, l.id FROM issues i JOIN project_labels l ON l.project_id = i.project_id
    WHERE i.project_id = v_proj AND (i.sequence_number, l.name) IN (
        (1,'backend'),(1,'securite'),(2,'backend'),(2,'securite'),(3,'backend'),(3,'securite'),
        (4,'backend'),(4,'rgpd'),(5,'ia'),(5,'backend'),(6,'ia'),(6,'backend'),(7,'ia'),(7,'backend'),
        (8,'ia'),(9,'ia'),(9,'billing'),(10,'ia'),(10,'backend'),(11,'billing'),(11,'backend'),
        (12,'billing'),(12,'backend'),(13,'infra'),(14,'infra'),(15,'infra'),(16,'frontend'),(16,'ux'),
        (17,'backend'),(18,'frontend'),(19,'frontend'),(19,'ux'),(20,'frontend'),(21,'billing'),
        (22,'ia'),(22,'frontend'),(23,'ia'),(23,'infra'),(24,'backend'),(25,'securite'),(26,'frontend'));

    RAISE NOTICE 'Projet demo "TaskForce" (TF, id=%) cree dans le workspace demo : 27 issues reelles (Done/Review/Progress/Todo/Backlog/Cancelled), ~2/3 assignees, le reste non assigne pour Smart Assign.', v_proj;
END
$tf$;
