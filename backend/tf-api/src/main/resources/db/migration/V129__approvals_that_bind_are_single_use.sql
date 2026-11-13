-- ============================================================
-- V129 -- un accord sur une decision qui lie ne vaut qu'une fois
-- (TF-J2-4 ; seance n°22 du Conseil, R157, avec R46 et R98)
-- ============================================================
-- Depend de : V96 (delivery_run_approvals), V125.
--
-- binding : la decision que la demande porte lie. Elle vient d'une couche de l'entreprise, d'une regle qui porte des
-- obligations (qui accorde, combien de signatures, un seuil) ou du socle. Un accord y vaut pour cet appel seulement,
-- jamais pour le reste de la mission ; les demandes d'avant restent ordinaires.

ALTER TABLE delivery_run_approvals ADD COLUMN binding BOOLEAN NOT NULL DEFAULT FALSE;
