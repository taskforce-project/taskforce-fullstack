-- V16 — Issues : statuts, types, séquences, issues, labels, commentaires, activité
-- Dépend de : V15 (projects, project_labels), V1 (users)

-- ============================================================
-- ENUMs
-- ============================================================

CREATE TYPE issue_priority          AS ENUM ('NONE', 'URGENT', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE issue_status_category   AS ENUM ('BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELLED');
CREATE TYPE issue_activity_type     AS ENUM (
    'CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNEE_CHANGED',
    'TYPE_CHANGED', 'TITLE_CHANGED', 'DESCRIPTION_CHANGED',
    'LABEL_ADDED', 'LABEL_REMOVED', 'DUE_DATE_CHANGED', 'START_DATE_CHANGED',
    'PARENT_CHANGED', 'COMMENT_ADDED', 'COMMENT_DELETED',
    'COMPLETED', 'REOPENED'
);

-- ============================================================
-- issue_statuses — configurables par projet
-- La catégorie pilote les vues kanban et les filtres
-- ============================================================

CREATE TABLE issue_statuses (
    id          BIGSERIAL             PRIMARY KEY,
    project_id  BIGINT                NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        VARCHAR(50)           NOT NULL,
    color       VARCHAR(30)           NOT NULL DEFAULT '#6366f1',
    category    issue_status_category NOT NULL,
    position    SMALLINT              NOT NULL DEFAULT 0,   -- ordre d'affichage dans le kanban
    is_default  BOOLEAN               NOT NULL DEFAULT false,
    created_at  TIMESTAMP             NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_issue_status_name UNIQUE (project_id, name)
);

CREATE INDEX idx_issue_statuses_project_id ON issue_statuses(project_id);

-- ============================================================
-- issue_types — configurables par projet
-- Ex : Bug, Feature, Task, Improvement, Sub-task
-- ============================================================

CREATE TABLE issue_types (
    id          BIGSERIAL   PRIMARY KEY,
    project_id  BIGINT      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        VARCHAR(50) NOT NULL,
    color       VARCHAR(30) NOT NULL DEFAULT '#6366f1',
    icon        VARCHAR(50) NOT NULL DEFAULT 'circle-dot',  -- nom d'icône lucide
    is_default  BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_issue_type_name UNIQUE (project_id, name)
);

CREATE INDEX idx_issue_types_project_id ON issue_types(project_id);

-- ============================================================
-- issue_sequence_counters — numérotation par projet (ex : WEB-42)
-- Atomique : incrémenté dans une transaction lors de la création
-- ============================================================

CREATE TABLE issue_sequence_counters (
    project_id  BIGINT  PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    last_number INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- issues — table principale
-- ============================================================

CREATE TABLE issues (
    id              BIGSERIAL       PRIMARY KEY,
    project_id      BIGINT          NOT NULL REFERENCES projects(id)       ON DELETE CASCADE,
    sequence_number INTEGER         NOT NULL,                               -- WEB-{sequence_number}
    title           VARCHAR(500)    NOT NULL,
    description     TEXT,                                                   -- markdown
    priority        issue_priority  NOT NULL DEFAULT 'NONE',
    status_id       BIGINT          NOT NULL REFERENCES issue_statuses(id) ON DELETE RESTRICT,
    type_id         BIGINT          REFERENCES issue_types(id)             ON DELETE SET NULL,
    assignee_id     BIGINT          REFERENCES users(id)                   ON DELETE SET NULL,
    reporter_id     BIGINT          NOT NULL REFERENCES users(id)          ON DELETE RESTRICT,
    parent_id       BIGINT          REFERENCES issues(id)                  ON DELETE SET NULL,  -- sous-issues
    start_date      DATE,
    due_date        DATE,
    completed_at    TIMESTAMP,                                              -- null si non terminé
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_issue_sequence UNIQUE (project_id, sequence_number)
);

CREATE INDEX idx_issues_project_id   ON issues(project_id);
CREATE INDEX idx_issues_status_id    ON issues(status_id);
CREATE INDEX idx_issues_type_id      ON issues(type_id);
CREATE INDEX idx_issues_assignee_id  ON issues(assignee_id);
CREATE INDEX idx_issues_reporter_id  ON issues(reporter_id);
CREATE INDEX idx_issues_parent_id    ON issues(parent_id);
CREATE INDEX idx_issues_priority     ON issues(priority);
CREATE INDEX idx_issues_due_date     ON issues(due_date);
CREATE INDEX idx_issues_created_at   ON issues(created_at);

-- ============================================================
-- issue_label_assignments — many-to-many issues ↔ project_labels
-- ============================================================

CREATE TABLE issue_label_assignments (
    issue_id    BIGINT NOT NULL REFERENCES issues(id)         ON DELETE CASCADE,
    label_id    BIGINT NOT NULL REFERENCES project_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, label_id)
);

CREATE INDEX idx_issue_label_assignments_label_id ON issue_label_assignments(label_id);

-- ============================================================
-- issue_comments
-- ============================================================

CREATE TABLE issue_comments (
    id          BIGSERIAL   PRIMARY KEY,
    issue_id    BIGINT      NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id   BIGINT      NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
    content     TEXT        NOT NULL,
    is_edited   BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_issue_comments_issue_id ON issue_comments(issue_id);

-- ============================================================
-- issue_activity — journal automatique de toutes les modifications
-- old_value / new_value : représentation textuelle (ex: nom du statut)
-- ============================================================

CREATE TABLE issue_activity (
    id          BIGSERIAL           PRIMARY KEY,
    issue_id    BIGINT              NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    actor_id    BIGINT              REFERENCES users(id)           ON DELETE SET NULL,
    action      issue_activity_type NOT NULL,
    old_value   VARCHAR(500),
    new_value   VARCHAR(500),
    created_at  TIMESTAMP           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_issue_activity_issue_id  ON issue_activity(issue_id);
CREATE INDEX idx_issue_activity_actor_id  ON issue_activity(actor_id);
CREATE INDEX idx_issue_activity_action    ON issue_activity(action);
