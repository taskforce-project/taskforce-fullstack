-- P1 bêta fermée — identification de cohorte des bêta-testeurs (pour filtrer les métriques par vague
-- et par contexte). La cohorte est une propriété de la PERSONNE (pas du workspace) : cf. audit bêta —
-- un utilisateur peut appartenir à plusieurs workspaces (le sien + ceux où il est invité).
--
-- Peuplé MANUELLEMENT par testeur depuis le formulaire d'intake (petite vague ~10-15) :
--   UPDATE users SET beta_cohort='beta_2026_09', beta_context='PROFESSIONAL' WHERE email='...';
-- (ou en bulk par fenêtre de created_at). Pas de tag automatique au signup : le contexte vient de
-- l'intake, et le repo/app étant publics, on ne veut pas taguer les inscriptions non-testeurs.

ALTER TABLE users ADD COLUMN beta_cohort  VARCHAR(50);
ALTER TABLE users ADD COLUMN beta_context VARCHAR(20);

-- Contexte contraint (mêmes valeurs que le protocole bêta : pro / perso / exploration libre).
ALTER TABLE users ADD CONSTRAINT chk_users_beta_context
    CHECK (beta_context IS NULL OR beta_context IN ('PROFESSIONAL', 'PERSONAL', 'FREE'));

-- Index pour filtrer/agréger une cohorte efficacement (Grafana → Postgres).
CREATE INDEX idx_users_beta_cohort ON users (beta_cohort);
