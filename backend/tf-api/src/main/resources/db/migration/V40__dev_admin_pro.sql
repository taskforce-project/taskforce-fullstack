-- V40 — Dev/seed : passe l'admin en PRO pour exercer le feature gating (PROD-4.4).
-- No-op en prod si ce compte de test n'existe pas.
UPDATE users SET plan_type = 'PRO' WHERE email = 'admin@taskforce.dev';
