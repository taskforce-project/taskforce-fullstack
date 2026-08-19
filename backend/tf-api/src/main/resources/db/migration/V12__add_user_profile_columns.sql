-- V12 : Ajout des colonnes display_name et avatar_url dans la table users
-- Ces colonnes permettent à l'utilisateur de personnaliser son profil.
-- display_name : si NULL, le backend construit la valeur depuis Keycloak (firstName + lastName)
-- avatar_url   : URL externe ou chemin interne vers l'image de profil

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS avatar_url   VARCHAR(500);
