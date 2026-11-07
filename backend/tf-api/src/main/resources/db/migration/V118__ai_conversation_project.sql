-- V118 : une conversation de Cortex connaît le projet où elle a commencé (R121, séance n°18 du Conseil).
-- Dépend de : V65 (ai_conversation), V15 (projects).
--
-- `project_id` : le projet à l'écran quand la conversation a commencé (R114 envoie le projet ouvert avec chaque
-- message). La barre de gauche range la conversation sous ce projet. Null sans projet à l'écran : les conversations
-- existantes ne changent pas. Un projet supprimé laisse ses conversations, hors projet.
ALTER TABLE ai_conversation ADD COLUMN project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL;

-- La suppression d'un projet retrouve ses conversations sans parcourir la table.
CREATE INDEX idx_ai_conversation_project ON ai_conversation (project_id) WHERE project_id IS NOT NULL;
