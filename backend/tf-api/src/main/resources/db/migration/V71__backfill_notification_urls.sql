-- =============================================================================
-- V71 — Backfill des liens de notification (issue_url / project_url)
-- =============================================================================
-- Contexte : la table `notifications` ne porte AUCUNE clé étrangère vers issues
-- ou projects. Les liens sont dénormalisés à l'écriture (NotificationService
-- .buildNotification), à partir du slug du workspace et des ids numériques.
--
-- Conséquence : toute ligne insérée hors du code Java — en pratique les lignes
-- du seed de dev — arrive avec issue_url/project_url à NULL, et devient une
-- ligne morte dans le Signal Center : elle affiche bien « WEB-3 » mais le clic
-- ne mène nulle part, faute d'id à reconstruire au moment de la lecture.
--
-- Cette migration reconstruit les liens manquants à partir du seul élément
-- disponible, `issue_identifier` (« WEB-3 »), en le décomposant en
-- identifiant de projet + numéro de séquence, puis en rejoignant les tables.
-- Elle est idempotente (ne touche que les colonnes NULL) et sans effet sur une
-- base déjà saine.
-- =============================================================================

-- 1) Lignes rattachées à une issue : « <IDENTIFIANT_PROJET>-<NUMERO> ».
--    Le garde-fou regex évite un cast en échec sur un identifiant non conforme
--    (les signaux de surcharge, par exemple, portent une clé de déduplication).
UPDATE notifications n
SET issue_url   = '/' || w.slug || '/projects/' || p.id || '/issues/' || i.id,
    project_url = '/' || w.slug || '/projects/' || p.id
FROM workspaces w
JOIN projects p ON p.workspace_id = w.id
JOIN issues   i ON i.project_id   = p.id
WHERE n.workspace_id = w.id
  AND n.issue_url IS NULL
  AND n.issue_identifier ~ '^[A-Za-z0-9]+-[0-9]+$'
  AND p.identifier      = split_part(n.issue_identifier, '-', 1)
  AND i.sequence_number = split_part(n.issue_identifier, '-', 2)::int;

-- 2) Filet : une ligne dont l'issue reste introuvable (issue supprimée depuis,
--    identifiant fabriqué) doit au moins ramener vers son projet — mieux vaut
--    un contexte utile qu'un clic sans effet.
UPDATE notifications n
SET project_url = '/' || w.slug || '/projects/' || p.id
FROM workspaces w
JOIN projects p ON p.workspace_id = w.id
WHERE n.workspace_id = w.id
  AND n.project_url IS NULL
  AND n.project_name IS NOT NULL
  AND p.name = n.project_name;
