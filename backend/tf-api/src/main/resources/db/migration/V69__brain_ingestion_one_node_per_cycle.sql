-- Ingestion Brain OS — garantir « un node par cycle » au niveau du schéma.
--
-- L'ingestion écrit la fiche d'un cycle en upsert (chercher, puis créer ou mettre à jour). Sous
-- concurrence, c'est un check-then-act : plusieurs issues terminées coup sur coup déclenchent
-- chacune un listener @Async, et ces threads lisent tous « aucun node » avant qu'aucun n'ait
-- commité → chacun insère le sien. Constaté en conditions réelles : 4 doublons pour un cycle de
-- 4 issues, créés en 240 ms.
--
-- Le correctif principal est un verrou pessimiste pris sur la ligne du cycle avant l'écriture
-- (BrainIngestionService.writeCycleNode), qui sérialise ces threads. Cet index en est le garde-fou :
-- l'invariant appartient au schéma, pas seulement au code appelant — un futur appelant qui
-- oublierait le verrou se heurtera à la base.
--
-- Index PARTIEL (ref_type = 'CYCLE' uniquement) : les autres nodes rattachés n'ont pas cette
-- contrainte. Une issue peut légitimement porter plusieurs specs approuvées (ref_type = 'ISSUE').

-- 1. Dédoublonnage des nodes déjà écrits : on ne garde que le plus récent de chaque cycle.
--    La rétro de clôture remplace de toute façon les relevés d'avancement qui l'ont précédée.
DELETE FROM knowledge_nodes
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY workspace_id, ref_id
                   ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
               ) AS rn
        FROM knowledge_nodes
        WHERE ref_type = 'CYCLE'
    ) ranked
    WHERE ranked.rn > 1
);

-- 2. L'invariant, appliqué par la base. (Les arêtes des nodes supprimés tombent en cascade FK.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_knodes_cycle_ref
    ON knowledge_nodes (workspace_id, ref_id)
    WHERE ref_type = 'CYCLE';
