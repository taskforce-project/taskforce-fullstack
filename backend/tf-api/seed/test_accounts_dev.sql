-- ============================================================================
-- Comptes de test pour la QA multi-comptes (WS-10 VIEWER, WS-11, NOTIF-01, INTEL-09).
--
-- Contexte : les coéquipiers du seed principal (sarah.chen@seed…, etc.) sont data-only
-- (keycloak_id factice) → NON connectables. Les vrais logins Keycloak user01..user10
-- (mot de passe Taskforce@2024) existent dans le realm dev mais ne sont PAS membres du
-- workspace démo. Ce script les rattache, SANS wiper les données existantes (idempotent).
--
-- Rôles posés :
--   user01@taskforce.dev  → MEMBER du workspace + MEMBER projet   (NOTIF-01, INTEL-09)
--   user02@taskforce.dev  → MEMBER du workspace + VIEWER projet    (WS-10 lecture seule)
--   test@taskforce.dev    → laissé HORS du workspace                (WS-11 non-invité)
--
-- Exécution : psql sur la base dev, workspace démo déjà seedé.
--   docker exec -i taskforce-postgres-dev psql -U <user> -d <db> -f - < test_accounts_dev.sql
-- (ou via scripts/db.ps1 si un helper existe). Rejouable sans effet de bord.
-- ============================================================================
DO $$
DECLARE
  v_ws    BIGINT;
  v_owner BIGINT;
  v_proj  BIGINT;
  v_u1    BIGINT;
  v_u2    BIGINT;
BEGIN
  SELECT id, owner_id INTO v_ws, v_owner FROM workspaces WHERE slug = 'taskforce-demo';
  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'workspace taskforce-demo introuvable — applique d''abord le seed principal (dev_seed.sql).';
  END IF;

  -- Vrais comptes Keycloak (upsert par email ; keycloak_id = UUID FIXE du realm dev, pour que
  -- la provision JIT au login retrouve bien cette ligne via findByKeycloakId).
  INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active)
  VALUES ('10000000-0000-4000-8000-000000000001', 'user01@taskforce.dev', 'User 01', 'FREE', true)
  ON CONFLICT (email) DO UPDATE SET keycloak_id = EXCLUDED.keycloak_id
  RETURNING id INTO v_u1;

  INSERT INTO users (keycloak_id, email, display_name, plan_type, is_active)
  VALUES ('10000000-0000-4000-8000-000000000002', 'user02@taskforce.dev', 'User 02', 'FREE', true)
  ON CONFLICT (email) DO UPDATE SET keycloak_id = EXCLUDED.keycloak_id
  RETURNING id INTO v_u2;

  -- Membres du workspace (MEMBER), idempotent via NOT EXISTS (indépendant du nom de contrainte).
  INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
  SELECT v_ws, v_u1, 'MEMBER', v_owner
  WHERE NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = v_ws AND user_id = v_u1);

  INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
  SELECT v_ws, v_u2, 'MEMBER', v_owner
  WHERE NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = v_ws AND user_id = v_u2);

  -- Un projet du workspace pour poser les rôles projet.
  SELECT id INTO v_proj FROM projects WHERE workspace_id = v_ws ORDER BY id LIMIT 1;
  IF v_proj IS NOT NULL THEN
    -- user02 = VIEWER (WS-10). On force le rôle (DELETE+INSERT) pour être sûr du VIEWER.
    DELETE FROM project_members WHERE project_id = v_proj AND user_id = v_u2;
    INSERT INTO project_members (project_id, user_id, role, added_by)
    VALUES (v_proj, v_u2, 'VIEWER'::project_role, v_owner);

    -- user01 = MEMBER (peut voir/éditer), idempotent.
    INSERT INTO project_members (project_id, user_id, role, added_by)
    SELECT v_proj, v_u1, 'MEMBER'::project_role, v_owner
    WHERE NOT EXISTS (SELECT 1 FROM project_members WHERE project_id = v_proj AND user_id = v_u1);

    RAISE NOTICE 'Comptes test rattachés : user01 (MEMBER) + user02 (VIEWER) sur le projet %', v_proj;
  ELSE
    RAISE NOTICE 'Aucun projet dans le workspace démo — rôles projet non posés.';
  END IF;
END $$;
