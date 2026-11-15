-- Les processus (ADR-027, TF-J2-2) : une définition par processus d'un projet, par sa clé, et ses versions. Chaque
-- publication écrit une version, numérotée à la suite dans la définition, avec son auteur, sa date et l'empreinte de son
-- modèle (sha256 du JSON canonique, comme les règles, V125). Une version ne change jamais : la base le refuse, comme le
-- service ; seul l'effacement du compte de son auteur la touche (created_by passe à NULL, par la clé étrangère). Une
-- version ne s'efface pas seule, une définition non plus : elles partent avec leur projet ou leur espace. Personne ne
-- vide ces tables d'un coup.
CREATE TABLE process_definitions (
    id           BIGSERIAL   PRIMARY KEY,
    workspace_id BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id   BIGINT      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- La clé du processus, celle que nomme une couche des règles de portée PROCESS (harness_rule_sets.process_key).
    process_key  VARCHAR(80) NOT NULL,
    created_by   BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMP   NOT NULL DEFAULT now(),
    CONSTRAINT uq_process_definitions_key UNIQUE (project_id, process_key),
    CONSTRAINT ck_process_definitions_key CHECK (process_key ~ '^[a-z][a-z0-9-]{0,79}$')
);

CREATE INDEX idx_process_definitions_workspace ON process_definitions (workspace_id);

CREATE TABLE process_versions (
    id            BIGSERIAL    PRIMARY KEY,
    definition_id BIGINT       NOT NULL REFERENCES process_definitions(id) ON DELETE CASCADE,
    version       INTEGER      NOT NULL,
    name          VARCHAR(200) NOT NULL,
    -- Le modèle du processus (contracts/process/README.md), forme de référence ; le XML de BPMN n'est qu'un export.
    model         JSONB        NOT NULL,
    digest        VARCHAR(71)  NOT NULL,
    created_by    BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT uq_process_versions_version UNIQUE (definition_id, version),
    CONSTRAINT ck_process_versions_version CHECK (version >= 1),
    CONSTRAINT ck_process_versions_digest CHECK (digest ~ '^sha256:[0-9a-f]{64}$')
);

CREATE INDEX idx_process_versions_definition ON process_versions (definition_id, version DESC);

-- L'effacement d'un compte, d'un projet ou d'un espace passe par une clé étrangère, donc par un déclencheur interne : ce
-- qu'il fait aux processus arrive ici à une profondeur de deux au moins. Une écriture directe arrive à un.

-- Une définition ne change pas d'identifiant, d'espace, de projet ni de clé : une version et une couche des règles la
-- nomment. Son auteur ne s'efface qu'avec son compte.
CREATE OR REPLACE FUNCTION process_definitions_immutable() RETURNS trigger AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.process_key IS DISTINCT FROM OLD.process_key OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (NEW.created_by IS DISTINCT FROM OLD.created_by
           AND (NEW.created_by IS NOT NULL OR pg_trigger_depth() < 2)) THEN
        RAISE EXCEPTION 'A process keeps its key and its project: publish a new process instead';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_process_definitions_immutable
    BEFORE UPDATE ON process_definitions
    FOR EACH ROW EXECUTE FUNCTION process_definitions_immutable();

-- Une version publiée ne se modifie pas ; son auteur ne s'efface qu'avec son compte.
CREATE OR REPLACE FUNCTION process_versions_immutable() RETURNS trigger AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.definition_id IS DISTINCT FROM OLD.definition_id OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.name IS DISTINCT FROM OLD.name OR NEW.model IS DISTINCT FROM OLD.model
       OR NEW.digest IS DISTINCT FROM OLD.digest OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (NEW.created_by IS DISTINCT FROM OLD.created_by
           AND (NEW.created_by IS NOT NULL OR pg_trigger_depth() < 2)) THEN
        RAISE EXCEPTION 'A published version of a process never changes: publish a new one';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_process_versions_immutable
    BEFORE UPDATE ON process_versions
    FOR EACH ROW EXECUTE FUNCTION process_versions_immutable();

-- Une version ne s'efface pas seule, une définition non plus (elle emporterait ses versions) : seulement avec leur
-- projet ou leur espace.
CREATE OR REPLACE FUNCTION process_versions_kept() RETURNS trigger AS $$
BEGIN
    IF pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION 'A published version of a process is never deleted on its own';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_process_versions_kept
    BEFORE DELETE ON process_versions
    FOR EACH ROW EXECUTE FUNCTION process_versions_kept();

CREATE OR REPLACE FUNCTION process_definitions_kept() RETURNS trigger AS $$
BEGIN
    IF pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION 'A process is never deleted on its own: it leaves with its project';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_process_definitions_kept
    BEFORE DELETE ON process_definitions
    FOR EACH ROW EXECUTE FUNCTION process_definitions_kept();

-- Vider une table d'un coup ne passe par aucun déclencheur de ligne : cela se refuse à part.
CREATE OR REPLACE FUNCTION process_tables_kept() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'The published processes are never emptied: a version leaves only with its project';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_process_definitions_not_truncated
    BEFORE TRUNCATE ON process_definitions
    FOR EACH STATEMENT EXECUTE FUNCTION process_tables_kept();

CREATE TRIGGER trg_process_versions_not_truncated
    BEFORE TRUNCATE ON process_versions
    FOR EACH STATEMENT EXECUTE FUNCTION process_tables_kept();
