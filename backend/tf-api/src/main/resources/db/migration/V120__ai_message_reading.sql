-- V120 : la ligne grise sous chaque réponse de Cortex (R123, séance n°18 du Conseil).
-- Dépend de : V65 (ai_message), V117 (ai_message.model).
--
-- `reading` : ce que TaskForce a donné à lire au modèle pour cette réponse, compté (les issues lues et leurs
-- commentaires, les tableaux montrés, les outils qui lisent, les notes du Brain OS). La ligne grise le montre, aussi dans
-- une conversation rouverte. Null pour une demande, une réponse de repli, et les messages d'avant : ils ne changent pas.
ALTER TABLE ai_message ADD COLUMN reading JSONB;
