-- V74 : purge des avatar_url pointant vers l'API DiceBear externe (https://api.dicebear.com/...).
--
-- Ces URLs étaient écrites par l'ancienne auto-génération d'avatar (UserService) quand l'utilisateur
-- n'avait pas de photo. Or la CSP `img-src` de production n'autorise pas api.dicebear.com → l'image
-- était bloquée et la personne apparaissait « sans photo de profil ».
--
-- On les remet à NULL : le front génère alors un identicon DiceBear LOCALEMENT (data-URI déterministe
-- par email, cf. frontend/lib/utils/avatar.ts::getAvatarUrl). UserService ne réécrit plus d'URL externe.
UPDATE users
SET avatar_url = NULL
WHERE avatar_url LIKE 'https://api.dicebear.com/%';
