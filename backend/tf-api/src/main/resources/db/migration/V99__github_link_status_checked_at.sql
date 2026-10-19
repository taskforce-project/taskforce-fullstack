-- ============================================================
-- V99 -- statut des pull requests liees aux issues, relu chez GitHub (OSS-6.3)
-- ============================================================
-- Le statut d'un lien de PR (OPEN, MERGED, CLOSED) etait ecrit une fois, a la creation du lien, puis jamais
-- relu : une PR fusionnee restait « open » dans TaskForce. Il est desormais relu chez GitHub quand on consulte
-- les liens d'une issue, au plus toutes les 5 minutes par lien ; cette colonne date la derniere relecture.

ALTER TABLE issue_github_links ADD COLUMN status_checked_at TIMESTAMP;
