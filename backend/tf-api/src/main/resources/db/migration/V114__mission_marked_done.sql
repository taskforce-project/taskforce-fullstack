-- V114 : terminer l'issue d'une mission qui n'a rien changé (rejeu de la 1.8.0, 02/11/2026).
-- Dépend de : V112 (valeurs MISSION_* de issue_activity_type).
--
-- Sur TESTTA-2, l'agent a trouvé le travail déjà fait : ni commit ni pull request, et « Apply » restait éteint sans dire
-- pourquoi. La carte propose alors « Mark as done » : l'issue se termine, et son activité le garde au nom de la personne
-- (« Pierre marked the issue done: no change was needed »). Le geste se garde sur la mission dans `outcome`
-- (VARCHAR(16), V110) sous la valeur MARKED_DONE, sans contrainte à changer. PostgreSQL (12 et plus) ajoute une valeur
-- d'enum dans la transaction de la migration ; aucune ligne ne s'en sert ici.
ALTER TYPE issue_activity_type ADD VALUE IF NOT EXISTS 'MISSION_MARKED_DONE';
