-- Retour OAuth « fluide » (TF-MCP-04) : chemin applicatif RELATIF vers lequel renvoyer l'utilisateur
-- apres le callback, au lieu de la page Settings par defaut. Permet de connecter un serveur MCP
-- depuis le wizard de creation de projet et d'y revenir directement. NULL = retour Settings (defaut).
ALTER TABLE mcp_oauth_states ADD COLUMN return_to VARCHAR(500);
