-- ===============================
-- MIGRATION V18 : Workspaces par défaut pour les users de dev seedés en V17
-- ===============================

-- 1. Créer un workspace par défaut pour chaque user seedé
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

-- 2. Ajouter chaque user comme OWNER de son workspace
INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
SELECT w.id, w.owner_id, 'OWNER', CURRENT_TIMESTAMP
FROM workspaces w
WHERE w.slug IN ('admin-taskforce-workspace', 'test-user-workspace')
ON CONFLICT (workspace_id, user_id) DO NOTHING;
