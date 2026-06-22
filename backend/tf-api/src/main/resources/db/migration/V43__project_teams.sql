-- PROD-3.6b : association many-to-many entre projets et équipes.
CREATE TABLE project_teams (
    id         BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_id    BIGINT NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_project_team UNIQUE (project_id, team_id)
);

CREATE INDEX idx_project_teams_project ON project_teams(project_id);
CREATE INDEX idx_project_teams_team    ON project_teams(team_id);
