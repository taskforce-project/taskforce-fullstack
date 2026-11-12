-- ============================================================
-- V128 -- une connexion a un outil se finit dans l'app, par la personne qui l'a lancee
-- (TF-J2-12 ; seance n°22 du Conseil, R154)
-- ============================================================
-- Depend de : V82 (mcp_oauth_states), V126.
--
-- Le retour du navigateur garde le code d'autorisation avec son state, puis renvoie vers l'app ; l'app, connectee,
-- finit l'echange, et seule la personne qui a cree le state le peut. code : le code rendu par l'editeur, chiffre au
-- repos (EncryptedStringConverter). finish_hash : l'empreinte SHA-256, en hexadecimal, du jeton a usage unique que seul
-- le navigateur revenu a recu ; l'app le presente pour finir.

ALTER TABLE mcp_oauth_states ADD COLUMN code TEXT;
ALTER TABLE mcp_oauth_states ADD COLUMN finish_hash VARCHAR(64);
