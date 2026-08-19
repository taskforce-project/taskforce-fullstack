-- V54 — Réinitialise les embeddings existants (cache dérivé) car l'algorithme a changé
-- (vecteur de bruit → embedding lexical par feature hashing). Les nodes seront ré-indexés
-- paresseusement à la prochaine ouverture/recherche (backfill borné + index partiel V53).
UPDATE knowledge_nodes SET embedding = NULL WHERE embedding IS NOT NULL;
