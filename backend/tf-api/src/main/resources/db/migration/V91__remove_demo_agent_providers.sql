-- Retrait des fournisseurs d'agent factices ou jamais testés (lot 3 du plan open source, ADR-018) :
-- stub (agent de démo), claude-api, github-copilot (un appel à GitHub Models, pas le vrai agent) et
-- cursor. Seul Claude Code, exécuté par le runner local, reste.

-- 1. Les clés API Anthropic et Cursor des workspaces n'ont plus d'usage. L'enum IntegrationProvider ne
--    connaît plus ces valeurs : une ligne restante ferait échouer la lecture des intégrations du
--    workspace (catalogue en erreur 500).
DELETE FROM integrations WHERE provider IN ('ANTHROPIC', 'CURSOR');

-- 2. Un run encore en attente ou en cours chez un fournisseur retiré ne se terminerait jamais : plus
--    aucun fournisseur pour l'interroger ou le clore. Il est clos en échec, avec un message lisible.
UPDATE delivery_runs
SET status = 'FAILED',
    error = 'This agent is no longer available. Delegate the task to Claude Code instead.',
    updated_at = NOW()
WHERE provider_key IN ('stub', 'claude-api', 'github-copilot', 'cursor')
  AND status IN ('QUEUED', 'RUNNING');
