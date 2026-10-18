-- Lot 4 (IA locale d'abord) : chaque vecteur porte le nom du modèle d'embeddings qui l'a produit.
-- La recherche ne compare un vecteur de requête qu'aux vecteurs du même modèle, et un changement de modèle
-- (AI_EMBED_MODEL) déclenche la réindexation au lieu de mélanger des espaces de vecteurs incomparables.
--
-- Les vecteurs existants sont effacés : ils n'ont pas de nom de modèle, et une partie vient de l'ancien repli
-- « lexical » de l'ai-service (hachage de mots, rangé dans la même colonne que les vrais vecteurs). La
-- réindexation en tâche de fond les recalcule dès qu'un modèle d'embeddings est disponible ; d'ici là, la
-- recherche du Brain OS passe en plein texte.
ALTER TABLE knowledge_nodes ADD COLUMN embedding_model VARCHAR(120);

UPDATE knowledge_nodes SET embedding = NULL WHERE embedding IS NOT NULL;
