-- V47 — Time tracking : entrées de temps (worklogs) par issue (BE-ISS-012).
CREATE TABLE issue_worklogs (
    id          BIGSERIAL    PRIMARY KEY,
    issue_id    BIGINT       NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id     BIGINT       NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    minutes     INT          NOT NULL,
    description VARCHAR(500),
    logged_at   DATE         NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_issue_worklogs_issue_id ON issue_worklogs(issue_id);
CREATE INDEX idx_issue_worklogs_user_id  ON issue_worklogs(user_id);
