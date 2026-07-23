-- V72 — Suppression de la table refresh_tokens (code mort)
--
-- L'authentification passe entièrement par Keycloak depuis TF-RGPD-007 : la rotation des refresh
-- tokens est gérée par l'IdP (`AuthService.refreshToken` délègue à Keycloak, cf. ADR-011).
-- La table créée en V3 n'a plus aucun écrivain ni lecteur ; l'entité `RefreshToken` et son dépôt
-- `RefreshTokenRepository` sont supprimés dans le même lot.
--
-- Ne PAS confondre avec `RefreshTokenRequest` (DTO) ni `AuthService.refreshToken(...)`, toujours
-- utilisés — ils délèguent à Keycloak et ne touchent pas cette table.
--
-- Aucune FK entrante : `refresh_tokens` porte une FK sortante vers `users` (ON DELETE CASCADE),
-- personne ne la référence. Le DROP est donc sûr sans ordre particulier.

DROP TABLE IF EXISTS refresh_tokens;
