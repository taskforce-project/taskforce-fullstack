-- La colonne users.plan_type reprend une valeur par défaut.
--
-- TaskForce est libre et auto-hébergeable (ADR-016) : l'application ne lit ni n'écrit plus de forfait, et le
-- champ a quitté l'entité User. La colonne reste (aucune migration destructive), mais elle était NOT NULL
-- sans défaut depuis V6 : le DROP TYPE plan_type CASCADE y a emporté le DEFAULT 'FREE' d'origine. Sans ce
-- défaut, créer un compte échouerait. 'FREE' respecte la contrainte chk_user_plan_type (V68).
ALTER TABLE users ALTER COLUMN plan_type SET DEFAULT 'FREE';
