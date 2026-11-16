-- V133 : l'objectif d'un projet (la vue du workflow, lot W1, R166, séance n°24 du Conseil).
-- Dépend de : V1 (users), V15 (projects).
--
-- Un projet a un objectif ou aucun : le but en une phrase (goal), une date visée si l'on veut (target_date), et d'un à
-- cinq critères de réussite (criteria, un tableau JSON de textes). Une table à lui plutôt que des colonnes de projects :
-- l'objectif se pose, se change et se retire seul, avec qui l'a fait en dernier (updated_by) et quand (updated_at).
-- Le retirer supprime la ligne. Le projet supprimé emporte son objectif ; la personne supprimée laisse l'objectif sans
-- auteur. SQL simple, sans extension : la même migration tourne dans la base embarquée de l'app desktop.
CREATE TABLE project_objectives (
    project_id  BIGINT       PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    goal        VARCHAR(280) NOT NULL,
    target_date DATE,
    criteria    JSONB        NOT NULL,
    updated_by  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMP    NOT NULL,
    -- CASE plutôt que AND : PostgreSQL ne promet pas l'ordre d'évaluation, et jsonb_array_length échoue sur un scalaire.
    CONSTRAINT ck_project_objectives_criteria CHECK (
        CASE WHEN jsonb_typeof(criteria) = 'array' THEN jsonb_array_length(criteria) BETWEEN 1 AND 5 ELSE FALSE END
    )
);
