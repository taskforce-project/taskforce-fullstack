-- V117 : une réponse de Cortex garde le modèle qui l'a écrite, tel que la passerelle l'a appelé.
-- Dépend de : V65 (ai_message).
--
-- `model` : le modèle qui a répondu (« qwen3:8b »), que le pied de la réponse montre, aussi dans une conversation
-- rouverte (test du CEO du 05/11/2026 : « jsp avec quel model il a fait ca »). Null pour la demande de la personne, une
-- réponse de repli, et les messages d'avant : ils ne changent pas.
ALTER TABLE ai_message ADD COLUMN model VARCHAR(128);
