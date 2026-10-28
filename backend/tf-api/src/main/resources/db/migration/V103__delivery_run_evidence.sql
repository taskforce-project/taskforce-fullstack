-- Sprint de la v2, jour 1 : le dossier de preuve d'une mission (spécification de la v2, §9 ; contracts/evidence).
--
-- delivery_run_evidence : journal chaîné, ajouté et jamais modifié. Chaque événement porte l'empreinte du précédent
-- et la sienne, calculées par le serveur à la réception, dans l'ordre : le runner ne peut pas réécrire l'histoire.
-- `at` et `data` sont gardés tels qu'ils entrent dans l'empreinte (texte ISO-8601, JSON canonique) : un export se
-- vérifie par simple recalcul, sans TaskForce. La chronologie du run (delivery_run_events) reste l'affichage en
-- direct, avec son plafond ; le journal a le sien, plus haut, et dit quand il est atteint.
--
-- delivery_runs.evidence_root : l'empreinte du dernier événement, posée à la fin de la mission. Elle scelle le dossier.
CREATE TABLE delivery_run_evidence (
    id          BIGSERIAL PRIMARY KEY,
    run_id      BIGINT       NOT NULL REFERENCES delivery_runs(id) ON DELETE CASCADE,
    seq         INTEGER      NOT NULL,
    at          VARCHAR(32)  NOT NULL,
    type        VARCHAR(32)  NOT NULL,
    actor_kind  VARCHAR(16)  NOT NULL,
    actor_id    VARCHAR(255) NOT NULL,
    data        TEXT         NOT NULL,
    prev        VARCHAR(71)  NOT NULL,
    hash        VARCHAR(71)  NOT NULL,
    CONSTRAINT uq_delivery_run_evidence_seq UNIQUE (run_id, seq)
);

ALTER TABLE delivery_runs ADD COLUMN evidence_root VARCHAR(71);
