-- ============================================================
-- V97 -- nom d'un serveur MCP personnalise, garde le temps du flux OAuth (OSS-6.1, ADR-020)
-- ============================================================
-- « Connecter n'importe quel serveur MCP » : un serveur hors prereglages porte une cle custom-<slug> et un nom
-- choisi par l'utilisateur. En OAuth, la connexion n'est creee qu'au retour du fournisseur : le nom doit donc
-- survivre entre le clic (start) et le callback, comme la cle. Null pour un prereglage du catalogue.

ALTER TABLE mcp_oauth_states ADD COLUMN mcp_name VARCHAR(60);
