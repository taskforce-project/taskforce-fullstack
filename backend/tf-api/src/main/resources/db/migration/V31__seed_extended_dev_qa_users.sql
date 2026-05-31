-- ===============================
-- MIGRATION V31 : Seed QA etendu pour le DEV
-- ===============================
-- Ajoute 10 comptes de test non-admin synchronises avec le realm Keycloak DEV.
-- Objectif : fournir des comptes stables pour tester les permissions, la
-- collaboration multi-workspace et le chat sans dependre d'inscriptions manuelles.
--
-- Credentials Keycloak pour user01 -> user10 :
--   mot de passe unique : Taskforce@2024
-- ===============================

-- 1. Inserer les comptes QA non-admin
WITH seeded_users AS (
    SELECT *
    FROM (
        VALUES
            ('10000000-0000-4000-8000-000000000001', 'user01@taskforce.dev', 'User 01', 'PRO',        'User 01 Workspace', 'user01-workspace'),
            ('10000000-0000-4000-8000-000000000002', 'user02@taskforce.dev', 'User 02', 'PRO',        'User 02 Workspace', 'user02-workspace'),
            ('10000000-0000-4000-8000-000000000003', 'user03@taskforce.dev', 'User 03', 'FREE',       'User 03 Workspace', 'user03-workspace'),
            ('10000000-0000-4000-8000-000000000004', 'user04@taskforce.dev', 'User 04', 'FREE',       'User 04 Workspace', 'user04-workspace'),
            ('10000000-0000-4000-8000-000000000005', 'user05@taskforce.dev', 'User 05', 'ENTERPRISE', 'User 05 Workspace', 'user05-workspace'),
            ('10000000-0000-4000-8000-000000000006', 'user06@taskforce.dev', 'User 06', 'PRO',        'User 06 Workspace', 'user06-workspace'),
            ('10000000-0000-4000-8000-000000000007', 'user07@taskforce.dev', 'User 07', 'FREE',       'User 07 Workspace', 'user07-workspace'),
            ('10000000-0000-4000-8000-000000000008', 'user08@taskforce.dev', 'User 08', 'ENTERPRISE', 'User 08 Workspace', 'user08-workspace'),
            ('10000000-0000-4000-8000-000000000009', 'user09@taskforce.dev', 'User 09', 'FREE',       'User 09 Workspace', 'user09-workspace'),
            ('10000000-0000-4000-8000-000000000010', 'user10@taskforce.dev', 'User 10', 'PRO',        'User 10 Workspace', 'user10-workspace')
    ) AS t(keycloak_id, email, display_name, plan_type, workspace_name, workspace_slug)
)
INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active, created_at, updated_at)
SELECT
    su.keycloak_id,
    su.email,
    su.display_name,
    su.plan_type,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM seeded_users su
ON CONFLICT (keycloak_id) DO UPDATE
SET email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    plan_type = EXCLUDED.plan_type,
    is_active = true,
    updated_at = CURRENT_TIMESTAMP;

-- 2. Creer un workspace personnel pour chaque compte seed
WITH seeded_users AS (
    SELECT *
    FROM (
        VALUES
            ('10000000-0000-4000-8000-000000000001', 'User 01 Workspace', 'user01-workspace'),
            ('10000000-0000-4000-8000-000000000002', 'User 02 Workspace', 'user02-workspace'),
            ('10000000-0000-4000-8000-000000000003', 'User 03 Workspace', 'user03-workspace'),
            ('10000000-0000-4000-8000-000000000004', 'User 04 Workspace', 'user04-workspace'),
            ('10000000-0000-4000-8000-000000000005', 'User 05 Workspace', 'user05-workspace'),
            ('10000000-0000-4000-8000-000000000006', 'User 06 Workspace', 'user06-workspace'),
            ('10000000-0000-4000-8000-000000000007', 'User 07 Workspace', 'user07-workspace'),
            ('10000000-0000-4000-8000-000000000008', 'User 08 Workspace', 'user08-workspace'),
            ('10000000-0000-4000-8000-000000000009', 'User 09 Workspace', 'user09-workspace'),
            ('10000000-0000-4000-8000-000000000010', 'User 10 Workspace', 'user10-workspace')
    ) AS t(keycloak_id, workspace_name, workspace_slug)
)
INSERT INTO workspaces (name, slug, owner_id, created_at, updated_at)
SELECT
    su.workspace_name,
    su.workspace_slug,
    u.id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM seeded_users su
JOIN users u ON u.keycloak_id = su.keycloak_id
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    owner_id = EXCLUDED.owner_id,
    updated_at = CURRENT_TIMESTAMP;

-- 3. Ajouter chaque utilisateur comme OWNER de son workspace personnel
WITH personal_workspaces AS (
    SELECT w.id AS workspace_id, w.owner_id AS user_id
    FROM workspaces w
    WHERE w.slug IN (
        'user01-workspace', 'user02-workspace', 'user03-workspace', 'user04-workspace', 'user05-workspace',
        'user06-workspace', 'user07-workspace', 'user08-workspace', 'user09-workspace', 'user10-workspace'
    )
)
INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
SELECT pw.workspace_id, pw.user_id, 'OWNER', CURRENT_TIMESTAMP
FROM personal_workspaces pw
ON CONFLICT (workspace_id, user_id) DO UPDATE
SET role = EXCLUDED.role,
    joined_at = COALESCE(workspace_members.joined_at, EXCLUDED.joined_at);

-- 4. Creer deux workspaces collaboratifs pour les tests manuels
INSERT INTO workspaces (name, slug, description, owner_id, created_at, updated_at)
SELECT
    'QA Shared Workspace',
    'qa-shared-workspace',
    'Workspace de collaboration pour le smoke test complet',
    u.id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM users u
WHERE u.keycloak_id = '10000000-0000-4000-8000-000000000001'
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    owner_id = EXCLUDED.owner_id,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO workspaces (name, slug, description, owner_id, created_at, updated_at)
SELECT
    'QA Ops Workspace',
    'qa-ops-workspace',
    'Workspace secondaire pour verifier l isolation et les droits',
    u.id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM users u
WHERE u.keycloak_id = '10000000-0000-4000-8000-000000000008'
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    owner_id = EXCLUDED.owner_id,
    updated_at = CURRENT_TIMESTAMP;

-- 5. Ajouter les membres des workspaces collaboratifs avec roles stables
WITH qa_shared AS (
    SELECT id AS workspace_id FROM workspaces WHERE slug = 'qa-shared-workspace'
),
qa_shared_members AS (
    SELECT *
    FROM (
        VALUES
            ('10000000-0000-4000-8000-000000000001', 'OWNER',  NULL),
            ('10000000-0000-4000-8000-000000000002', 'ADMIN',  '10000000-0000-4000-8000-000000000001'),
            ('10000000-0000-4000-8000-000000000003', 'MEMBER', '10000000-0000-4000-8000-000000000001'),
            ('10000000-0000-4000-8000-000000000004', 'MEMBER', '10000000-0000-4000-8000-000000000001'),
            ('10000000-0000-4000-8000-000000000005', 'MEMBER', '10000000-0000-4000-8000-000000000001'),
            ('10000000-0000-4000-8000-000000000006', 'MEMBER', '10000000-0000-4000-8000-000000000002')
    ) AS t(member_keycloak_id, role, invited_by_keycloak_id)
)
INSERT INTO workspace_members (workspace_id, user_id, role, invited_by, joined_at)
SELECT
    qs.workspace_id,
    member_user.id,
    qsm.role,
    inviter.id,
    CURRENT_TIMESTAMP
FROM qa_shared qs
JOIN qa_shared_members qsm ON TRUE
JOIN users member_user ON member_user.keycloak_id = qsm.member_keycloak_id
LEFT JOIN users inviter ON inviter.keycloak_id = qsm.invited_by_keycloak_id
ON CONFLICT (workspace_id, user_id) DO UPDATE
SET role = EXCLUDED.role,
    invited_by = EXCLUDED.invited_by;

WITH qa_ops AS (
    SELECT id AS workspace_id FROM workspaces WHERE slug = 'qa-ops-workspace'
),
qa_ops_members AS (
    SELECT *
    FROM (
        VALUES
            ('10000000-0000-4000-8000-000000000008', 'OWNER',  NULL),
            ('10000000-0000-4000-8000-000000000009', 'ADMIN',  '10000000-0000-4000-8000-000000000008'),
            ('10000000-0000-4000-8000-000000000010', 'MEMBER', '10000000-0000-4000-8000-000000000008')
    ) AS t(member_keycloak_id, role, invited_by_keycloak_id)
)
INSERT INTO workspace_members (workspace_id, user_id, role, invited_by, joined_at)
SELECT
    qo.workspace_id,
    member_user.id,
    qom.role,
    inviter.id,
    CURRENT_TIMESTAMP
FROM qa_ops qo
JOIN qa_ops_members qom ON TRUE
JOIN users member_user ON member_user.keycloak_id = qom.member_keycloak_id
LEFT JOIN users inviter ON inviter.keycloak_id = qom.invited_by_keycloak_id
ON CONFLICT (workspace_id, user_id) DO UPDATE
SET role = EXCLUDED.role,
    invited_by = EXCLUDED.invited_by;

-- 6. Creer les canaux par defaut des workspaces collaboratifs, car ces workspaces
-- sont crees via Flyway et ne passent pas par le service applicatif.
INSERT INTO channels (workspace_id, kind, name, description, is_private, is_archived, created_by, created_at, updated_at)
SELECT
    w.id,
    'CHANNEL',
    'general',
    'Conversations generales',
    false,
    false,
    w.owner_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM workspaces w
WHERE w.slug IN ('qa-shared-workspace', 'qa-ops-workspace')
  AND NOT EXISTS (
      SELECT 1
      FROM channels c
      WHERE c.workspace_id = w.id
        AND c.project_id IS NULL
        AND c.name = 'general'
  );

INSERT INTO channels (workspace_id, kind, name, description, is_private, is_archived, created_by, created_at, updated_at)
SELECT
    w.id,
    'CHANNEL',
    'announcements',
    'Annonces importantes',
    false,
    false,
    w.owner_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM workspaces w
WHERE w.slug IN ('qa-shared-workspace', 'qa-ops-workspace')
  AND NOT EXISTS (
      SELECT 1
      FROM channels c
      WHERE c.workspace_id = w.id
        AND c.project_id IS NULL
        AND c.name = 'announcements'
  );

-- 7. Ajouter tous les membres du workspace aux canaux seedes
INSERT INTO channel_members (channel_id, user_id, joined_at)
SELECT
    c.id,
    wm.user_id,
    CURRENT_TIMESTAMP
FROM channels c
JOIN workspaces w ON w.id = c.workspace_id
JOIN workspace_members wm ON wm.workspace_id = w.id
WHERE w.slug IN ('qa-shared-workspace', 'qa-ops-workspace')
  AND c.name IN ('general', 'announcements')
ON CONFLICT (channel_id, user_id) DO NOTHING;

-- 8. Seed minimal de messages pour verifier le chargement REST et le temps reel
INSERT INTO chat_messages (channel_id, author_id, content, created_at, updated_at)
SELECT
    c.id,
    u.id,
    'Bienvenue dans qa-shared-workspace. Utilisez ce canal pour le flow QA complet.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM channels c
JOIN workspaces w ON w.id = c.workspace_id
JOIN users u ON u.keycloak_id = '10000000-0000-4000-8000-000000000001'
WHERE w.slug = 'qa-shared-workspace'
  AND c.name = 'general'
  AND NOT EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.channel_id = c.id
        AND m.content = 'Bienvenue dans qa-shared-workspace. Utilisez ce canal pour le flow QA complet.'
  );

INSERT INTO chat_messages (channel_id, author_id, content, created_at, updated_at)
SELECT
    c.id,
    u.id,
    'Canal d annonces pret pour les tests de moderation et de lecture.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM channels c
JOIN workspaces w ON w.id = c.workspace_id
JOIN users u ON u.keycloak_id = '10000000-0000-4000-8000-000000000002'
WHERE w.slug = 'qa-shared-workspace'
  AND c.name = 'announcements'
  AND NOT EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.channel_id = c.id
        AND m.content = 'Canal d annonces pret pour les tests de moderation et de lecture.'
  );
