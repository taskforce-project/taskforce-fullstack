-- V116 : un commentaire dit par qui il est passé, comme l'activité de l'issue (V112).
-- Dépend de : V16 (issue_comments).
--
-- `via` : l'agent qui a écrit le commentaire au nom de la personne qui l'a délégué : le modèle de l'agent à l'essai de
-- R51 (« qwen3:8b »), l'agent d'une mission (« Claude Code ») par la session déléguée, ou Cortex dans la conversation.
-- Null quand la personne a écrit elle-même : les commentaires existants ne changent pas.
ALTER TABLE issue_comments ADD COLUMN via VARCHAR(60);
