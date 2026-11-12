-- Les règles de l'entreprise par couches (R157, séance n°22 ; TF-J2-4). Une ligne de harness_rule_sets est désormais une
-- version d'UNE couche de l'espace, au-dessus de la table de TaskForce : l'organisation (WORKSPACE), un projet, un
-- processus, un rôle de l'espace ou une personne. Les versions restent numérotées à la suite dans l'espace (une seule
-- suite, uq_harness_rule_sets_version) ; la version en vigueur d'une couche est sa dernière ligne. Une version ne change
-- jamais : son auteur, sa date et son empreinte sont gardés avec elle. Une ligne écrite avant les couches devient celle
-- de l'organisation, et le moteur ne lui laisse que ce qui durcit.
ALTER TABLE harness_rule_sets ADD COLUMN scope       VARCHAR(16) NOT NULL DEFAULT 'WORKSPACE';
ALTER TABLE harness_rule_sets ADD COLUMN project_id  BIGINT REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE harness_rule_sets ADD COLUMN process_key VARCHAR(80);
ALTER TABLE harness_rule_sets ADD COLUMN role        VARCHAR(16);
ALTER TABLE harness_rule_sets ADD COLUMN user_id     BIGINT REFERENCES users(id) ON DELETE CASCADE;
-- Empreinte de la version : sha256 du JSON canonique de ses règles, comme celle d'un paquet (contracts/README.md).
ALTER TABLE harness_rule_sets ADD COLUMN digest      VARCHAR(71);

ALTER TABLE harness_rule_sets ADD CONSTRAINT ck_harness_rule_sets_scope CHECK (
    (scope = 'WORKSPACE' AND project_id IS NULL AND process_key IS NULL AND role IS NULL AND user_id IS NULL)
 OR (scope = 'PROJECT' AND project_id IS NOT NULL AND process_key IS NULL AND role IS NULL AND user_id IS NULL)
 OR (scope = 'PROCESS' AND process_key IS NOT NULL AND project_id IS NULL AND role IS NULL AND user_id IS NULL)
 OR (scope = 'ROLE' AND role IN ('OWNER', 'ADMIN', 'MEMBER') AND project_id IS NULL AND process_key IS NULL AND user_id IS NULL)
 OR (scope = 'PERSON' AND user_id IS NOT NULL AND project_id IS NULL AND process_key IS NULL AND role IS NULL));

CREATE INDEX idx_harness_rule_sets_layer ON harness_rule_sets (workspace_id, scope, version DESC);

-- Une version ne se modifie pas : seul l'effacement de son auteur (compte supprimé, created_by passe à NULL) la touche.
CREATE OR REPLACE FUNCTION harness_rule_sets_immutable() RETURNS trigger AS $$
BEGIN
    IF NEW.rules IS DISTINCT FROM OLD.rules OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.scope IS DISTINCT FROM OLD.scope
       OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.process_key IS DISTINCT FROM OLD.process_key
       OR NEW.role IS DISTINCT FROM OLD.role OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.digest IS DISTINCT FROM OLD.digest OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL) THEN
        RAISE EXCEPTION 'A version of the rules never changes: write a new one';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_harness_rule_sets_immutable
    BEFORE UPDATE ON harness_rule_sets
    FOR EACH ROW EXECUTE FUNCTION harness_rule_sets_immutable();

-- Ce qu'un accord demandé par une règle de l'entreprise doit réunir (R98) : les listes de personnes désignées (une
-- personne de chaque liste ; null : la personne qui a délégué, comme avant), le nombre de signatures distinctes, et si
-- celle qui a délégué est exclue des signataires.
ALTER TABLE delivery_run_approvals ADD COLUMN approvers      JSONB;
ALTER TABLE delivery_run_approvals ADD COLUMN signatures     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE delivery_run_approvals ADD COLUMN separate_roles BOOLEAN NOT NULL DEFAULT FALSE;

-- Chaque signature d'un accord, une par personne : l'accord est donné quand elles réunissent ce qu'il demande, refusé
-- dès qu'une personne qui peut signer refuse.
CREATE TABLE delivery_run_approval_signatures (
    id          BIGSERIAL PRIMARY KEY,
    approval_id BIGINT    NOT NULL REFERENCES delivery_run_approvals(id) ON DELETE CASCADE,
    user_id     BIGINT    REFERENCES users(id) ON DELETE SET NULL,
    allow       BOOLEAN   NOT NULL,
    signed_at   TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_delivery_run_approval_signature UNIQUE (approval_id, user_id)
);
CREATE INDEX idx_delivery_run_approval_signatures_approval ON delivery_run_approval_signatures (approval_id);
