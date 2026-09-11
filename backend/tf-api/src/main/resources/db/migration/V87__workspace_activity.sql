-- Contexte metier de l'espace de travail : « que fait l'entreprise / equipe ? ».
-- Capte a l'onboarding (1er espace) et au dialog « New workspace » (espaces suivants).
-- Alimente une fiche de contexte dans le Brain OS (cf. BrainIngestionService.writeWorkspaceNode),
-- et reste editable dans les reglages. Nullable : les espaces existants n'en ont pas encore.
ALTER TABLE workspaces ADD COLUMN activity VARCHAR(500);
