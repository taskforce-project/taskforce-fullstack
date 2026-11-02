-- Le plan figé des analyses disparaît (TF-J1-3 ; séance n°15 du Conseil, J1, « les suppressions demandées par
-- Musk »). Dépend de : V60 (analysis_job).
--
-- `plan_json` portait les étapes d'une analyse (observer, contexte, analyse, clarification, sauvegarde) : le même plan
-- pour toutes, écrit dans le code, que le panneau « AI Workflows » montrait comme un processus que personne ne pouvait
-- modifier. Le backend ne le lit ni ne l'écrit plus. Le statut, la question et la réponse, l'erreur et le brief restent :
-- ils disent seuls où en est une analyse.
ALTER TABLE analysis_job DROP COLUMN IF EXISTS plan_json;
