-- Retour "fluide" apres la connexion OAuth d'une integration (GitHub) : chemin applicatif RELATIF ou
-- renvoyer l'utilisateur apres le consentement, au lieu de toujours retomber sur Settings > Integrations.
-- Cas d'usage : "Connect GitHub" depuis le dialogue de creation de projet, qui se rouvre au retour.
-- Meme idee que mcp_oauth_states.return_to (V84). Valide cote service (anti open-redirect) ; NULL =
-- comportement historique.
ALTER TABLE oauth_states ADD COLUMN return_to VARCHAR(500);
