-- ============================================================
-- V130 -- l'emetteur epingle sur l'application de l'entreprise
-- (TF-J2-12 ; seance n°22 du Conseil, R154)
-- ============================================================
-- Depend de : V126 (connector_app).
--
-- issuer : le serveur d'autorisation auquel l'application de l'entreprise se presente, avec son secret, pour un outil
-- sans serveur officiel (un serveur que l'entreprise cree ou tient : Glean, Zoho). Il s'epingle a la premiere connexion
-- d'un proprietaire ou d'un administrateur qui aboutit par elle ; nul tant qu'aucune n'a abouti. Pour un outil qui a un
-- serveur officiel, l'emetteur est celui que ce serveur designe, et la colonne reste nulle.

ALTER TABLE connector_app ADD COLUMN issuer TEXT;
