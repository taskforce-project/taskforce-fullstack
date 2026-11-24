-- TF-J2-7 (R198, R198 amendée, R212) : le dossier d'une mission survit à la suppression de son issue, ne se modifie
-- jamais, garde ses textes sensibles à côté de la chaîne, et se scelle.
-- Dépend de : V86 (delivery_runs), V103 (delivery_run_evidence), V125 (le modèle de protection des versions de règles).
--
-- Jusqu'ici, supprimer une issue effaçait sa mission (V86 : ON DELETE CASCADE), et la mission emportait son dossier
-- (V103 : ON DELETE CASCADE). Désormais le dossier pend à une ligne qui lui est propre, mission_dossiers, qui ne pend à
-- rien d'autre qu'à l'espace de travail : il vit aussi longtemps que l'espace, issue, projet et mission supprimés ou non.

-- 1. D'où vient la mission (R212, rubrique 1) : l'app, la conversation avec Cortex, un client du serveur MCP, une
--    relance (« Try again ») ou une reprise (« Ask for changes ») ; et la mission d'avant, pour les deux dernières.
ALTER TABLE delivery_runs ADD COLUMN origin        VARCHAR(16);
ALTER TABLE delivery_runs ADD COLUMN origin_run_id BIGINT;

-- 2. Le numéro du dernier événement reçu du runner : un lot perdu laisse un trou que le serveur voit, et marque.
ALTER TABLE delivery_runs ADD COLUMN evidence_runner_seq INTEGER NOT NULL DEFAULT 0;

-- 3. Le dossier : ce qu'il faut pour le retrouver et dire qui peut le lire quand l'issue n'est plus là (l'espace, le
--    projet, l'issue, la personne qui a délégué), et le paquet de règles tel qu'il est parti avec la mission, pour qu'un
--    tiers rejuge chaque action. Aucune clé étrangère vers la mission, l'issue ou le projet : rien ne cascade.
CREATE TABLE mission_dossiers (
    run_id        BIGINT       PRIMARY KEY,
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id    BIGINT,
    issue_id      BIGINT,
    issue_key     VARCHAR(80),
    delegated_by  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    rules_bundle  TEXT,
    created_at    TIMESTAMP    NOT NULL DEFAULT now()
);
CREATE INDEX idx_mission_dossiers_workspace ON mission_dossiers (workspace_id);

-- Les dossiers déjà ouverts reçoivent leur ligne, avant que leurs événements ne s'y rattachent.
INSERT INTO mission_dossiers (run_id, workspace_id, project_id, issue_id, issue_key, delegated_by, created_at)
SELECT r.id, p.workspace_id, p.id, i.id, p.identifier || '-' || i.sequence_number, r.started_by, r.created_at
FROM delivery_runs r
JOIN issues i ON i.id = r.issue_id
JOIN projects p ON p.id = i.project_id
WHERE EXISTS (SELECT 1 FROM delivery_run_evidence e WHERE e.run_id = r.id);

-- 4. Les événements ne pendent plus à la mission, mais à son dossier.
DO $$
DECLARE
    fk text;
BEGIN
    FOR fk IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'delivery_run_evidence'::regclass AND contype = 'f' LOOP
        EXECUTE format('ALTER TABLE delivery_run_evidence DROP CONSTRAINT %I', fk);
    END LOOP;
END $$;
ALTER TABLE delivery_run_evidence
    ADD CONSTRAINT fk_delivery_run_evidence_dossier FOREIGN KEY (run_id) REFERENCES mission_dossiers (run_id) ON DELETE CASCADE;

-- 5. Les sceaux : la tête de la chaîne signée (une enveloppe DSSE d'un énoncé in-toto), un par état scellé, jamais
--    réécrits. Le dernier couvre tout le dossier.
CREATE TABLE mission_dossier_seals (
    id          BIGSERIAL    PRIMARY KEY,
    run_id      BIGINT       NOT NULL REFERENCES mission_dossiers (run_id) ON DELETE CASCADE,
    seq         INTEGER      NOT NULL,
    root        VARCHAR(71)  NOT NULL,
    sealed_at   VARCHAR(32)  NOT NULL,
    key_id      VARCHAR(71)  NOT NULL,
    envelope    TEXT         NOT NULL,
    CONSTRAINT uq_mission_dossier_seal UNIQUE (run_id, seq)
);

-- 6. Les textes à côté de la chaîne (R198 amendée, précision 4) : le titre, la description et le brief de la demande, ce
--    que l'agent raconte, son résumé. La chaîne n'en garde que l'empreinte ; le texte s'efface sans casser la chaîne, et
--    l'effacement garde qui et quand.
--    L'empreinte est salée (R159, M6) : le SHA-256 d'un sel tiré pour ce texte, suivi du texte ; le sel s'efface avec
--    lui, et l'empreinte restée ne confirme plus une supposition. Le courriel et le nom d'une personne que la chaîne
--    nomme y vivent aussi (`person`), effacés quand son compte est purgé.
CREATE TABLE mission_dossier_texts (
    id          BIGSERIAL    PRIMARY KEY,
    run_id      BIGINT       NOT NULL REFERENCES mission_dossiers (run_id) ON DELETE CASCADE,
    hash        VARCHAR(71)  NOT NULL,
    kind        VARCHAR(16)  NOT NULL,
    salt        VARCHAR(32),
    body        TEXT,
    person      VARCHAR(48),
    erased_at   TIMESTAMP,
    erased_by   BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_mission_dossier_text UNIQUE (run_id, hash)
);
CREATE INDEX idx_mission_dossier_texts_person ON mission_dossier_texts (person) WHERE person IS NOT NULL;

-- 6 bis. Une personne entre dans la chaîne par un identifiant opaque (R159, M6), jamais par son courriel : `who:` et 32
--    chiffres hexadécimaux, tiré au hasard la première fois, un par personne et par espace (R159, second tour, L-a). Il
--    est stable dans un espace, et rien ne relie les identifiants d'une même personne d'un espace à l'autre. Il est
--    retiré quand son compte est purgé : l'identifiant reste dans les chaînes, plus rien ne le relie à la personne.
CREATE TABLE mission_people (
    id            BIGSERIAL    PRIMARY KEY,
    workspace_id  BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    person        VARCHAR(48)  NOT NULL UNIQUE,
    created_at    TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT uq_mission_people UNIQUE (workspace_id, user_id)
);
CREATE INDEX idx_mission_people_user ON mission_people (user_id);

-- 7. Rien ne se modifie, comme les versions des règles (V125). Un événement ou un sceau ne s'efface qu'avec tout son
--    dossier, et un dossier qu'avec son espace de travail.
CREATE OR REPLACE FUNCTION mission_evidence_immutable() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'The evidence of a mission never changes';
    END IF;
    IF EXISTS (SELECT 1 FROM mission_dossiers WHERE run_id = OLD.run_id) THEN
        RAISE EXCEPTION 'The evidence of a mission is only deleted with its whole dossier';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delivery_run_evidence_immutable
    BEFORE UPDATE OR DELETE ON delivery_run_evidence
    FOR EACH ROW EXECUTE FUNCTION mission_evidence_immutable();

CREATE TRIGGER trg_mission_dossier_seals_immutable
    BEFORE UPDATE OR DELETE ON mission_dossier_seals
    FOR EACH ROW EXECUTE FUNCTION mission_evidence_immutable();

-- Seuls changent : la personne qui a délégué, quand son compte est supprimé (elle passe à NULL), et le paquet de règles
-- d'un dossier ouvert avant ce lot, posé une fois.
CREATE OR REPLACE FUNCTION mission_dossiers_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM workspaces WHERE id = OLD.workspace_id) THEN
            RAISE EXCEPTION 'The dossier of a mission is only deleted with its workspace';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.run_id IS DISTINCT FROM OLD.run_id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.issue_id IS DISTINCT FROM OLD.issue_id
       OR NEW.issue_key IS DISTINCT FROM OLD.issue_key OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (NEW.rules_bundle IS DISTINCT FROM OLD.rules_bundle AND OLD.rules_bundle IS NOT NULL)
       OR (NEW.delegated_by IS DISTINCT FROM OLD.delegated_by AND NEW.delegated_by IS NOT NULL) THEN
        RAISE EXCEPTION 'The dossier of a mission never changes';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mission_dossiers_guard
    BEFORE UPDATE OR DELETE ON mission_dossiers
    FOR EACH ROW EXECUTE FUNCTION mission_dossiers_guard();

-- Un texte à côté de la chaîne ne change jamais : il ne fait que s'effacer, une fois, avec qui et quand (la personne qui
-- l'a effacé passe à NULL quand son compte est supprimé). Il ne part qu'avec tout son dossier.
CREATE OR REPLACE FUNCTION mission_dossier_texts_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM mission_dossiers WHERE run_id = OLD.run_id) THEN
            RAISE EXCEPTION 'A text of a mission is only erased, never deleted';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.run_id IS DISTINCT FROM OLD.run_id OR NEW.hash IS DISTINCT FROM OLD.hash OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.person IS DISTINCT FROM OLD.person
       OR (NEW.body IS DISTINCT FROM OLD.body AND NEW.body IS NOT NULL)
       OR (NEW.salt IS DISTINCT FROM OLD.salt AND (NEW.salt IS NOT NULL OR NEW.body IS NOT NULL))
       OR (OLD.erased_at IS NOT NULL AND NEW.erased_at IS DISTINCT FROM OLD.erased_at)
       OR (NEW.body IS NOT NULL AND (NEW.erased_at IS NOT NULL OR NEW.erased_by IS NOT NULL))
       OR (OLD.erased_by IS NOT NULL AND NEW.erased_by IS DISTINCT FROM OLD.erased_by AND NEW.erased_by IS NOT NULL) THEN
        RAISE EXCEPTION 'A text of a mission never changes: it can only be erased';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mission_dossier_texts_guard
    BEFORE UPDATE OR DELETE ON mission_dossier_texts
    FOR EACH ROW EXECUTE FUNCTION mission_dossier_texts_guard();

-- Vider une table d'un coup ne passe par aucun déclencheur de ligne : cela se refuse à part (comme V132).
CREATE OR REPLACE FUNCTION mission_dossier_tables_kept() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'The dossiers of the missions are never emptied: a dossier leaves only with its workspace';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mission_dossiers_not_truncated
    BEFORE TRUNCATE ON mission_dossiers
    FOR EACH STATEMENT EXECUTE FUNCTION mission_dossier_tables_kept();

CREATE TRIGGER trg_delivery_run_evidence_not_truncated
    BEFORE TRUNCATE ON delivery_run_evidence
    FOR EACH STATEMENT EXECUTE FUNCTION mission_dossier_tables_kept();

CREATE TRIGGER trg_mission_dossier_seals_not_truncated
    BEFORE TRUNCATE ON mission_dossier_seals
    FOR EACH STATEMENT EXECUTE FUNCTION mission_dossier_tables_kept();

CREATE TRIGGER trg_mission_dossier_texts_not_truncated
    BEFORE TRUNCATE ON mission_dossier_texts
    FOR EACH STATEMENT EXECUTE FUNCTION mission_dossier_tables_kept();
