-- Brain OS réduit à son cœur (lot 3 du plan open source, ADR-017) : les gabarits de pages sont retirés,
-- le type de page TEMPLATE disparaît de l'enum NodeType. Une page de ce type, stockée par son nom, ne
-- pourrait plus être lue : elle devient une note.
UPDATE knowledge_nodes SET type = 'NOTE' WHERE type = 'TEMPLATE';
