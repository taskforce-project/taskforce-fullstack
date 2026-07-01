-- Hiérarchie récursive des nœuds du Brain OS : un nœud peut avoir un parent
-- (projet → système → sous-système → … → note), profondeur arbitraire.
ALTER TABLE knowledge_nodes
    ADD COLUMN parent_node_id BIGINT NULL REFERENCES knowledge_nodes (id) ON DELETE SET NULL;

CREATE INDEX idx_knodes_parent ON knowledge_nodes (parent_node_id);
