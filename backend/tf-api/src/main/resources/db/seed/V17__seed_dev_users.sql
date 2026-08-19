-- ===============================
-- MIGRATION V17 : Seed utilisateurs de développement
-- ===============================
-- Ces users correspondent exactement aux users définis dans keycloak/realms/dev/taskforce-dev-realm.json
-- Les keycloak_id sont fixes (définis dans le realm JSON via le champ "id") pour garantir
-- la cohérence entre Keycloak et PostgreSQL même après un restart/reimport du realm.
--
-- Credentials Keycloak :
--   admin@taskforce.dev  /  Admin@2024
--   test@taskforce.dev   /  Test@2024
-- ===============================

-- 1. Insérer les users
INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active, created_at, updated_at)
VALUES
    (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'admin@taskforce.dev',
        'Admin Taskforce',
        'FREE',
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'test@taskforce.dev',
        'Test User',
        'FREE',
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
ON CONFLICT (keycloak_id) DO NOTHING;

-- 2. Créer un workspace par défaut pour chaque user (comme le fait le flow d'inscription)
INSERT INTO workspaces (name, slug, owner_id, created_at, updated_at)
SELECT
    u.display_name || '''s Workspace',
    CASE u.email
        WHEN 'admin@taskforce.dev' THEN 'admin-taskforce-workspace'
        WHEN 'test@taskforce.dev'  THEN 'test-user-workspace'
    END,
    u.id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM users u
WHERE u.keycloak_id IN (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
)
ON CONFLICT (slug) DO NOTHING;

-- 3. Ajouter chaque user comme OWNER de son workspace
INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
SELECT w.id, w.owner_id, 'OWNER', CURRENT_TIMESTAMP
FROM workspaces w
WHERE w.slug IN ('admin-taskforce-workspace', 'test-user-workspace')
ON CONFLICT (workspace_id, user_id) DO NOTHING;

