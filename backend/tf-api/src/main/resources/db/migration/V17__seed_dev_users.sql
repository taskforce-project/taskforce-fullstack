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
