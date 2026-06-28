package com.taskforce.tf_api.core.service.brain;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.KnowledgeSearchHit;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.service.EmbeddingClient;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Recherche sémantique et indexation vectorielle du Brain OS (pgvector).
 * Responsabilité unique : embeddings (calcul/stockage) + retrieval par similarité cosine.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BrainSearchService {

    private final KnowledgeNodeRepository nodeRepository;
    private final EmbeddingClient         embeddingClient;
    private final JdbcTemplate            jdbcTemplate;
    private final BrainAccessGuard        access;

    private static final int BACKFILL_BATCH = 200;

    // =========================================================================
    // Recherche (exposée au controller)
    // =========================================================================

    @Transactional
    public List<KnowledgeSearchHit> search(String slug, Long userId, String query, Integer topK, String domain) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        int limit = Math.max(1, Math.min(topK != null ? topK : 8, 50));

        backfillMissingEmbeddings(ws.getId());

        float[] qvec = embeddingClient.embed(query);
        if (qvec == null) return List.of(); // ai-service indisponible → pas d'erreur
        String qLit = EmbeddingClient.toVectorLiteral(qvec);

        StringBuilder sql = new StringBuilder(
            "SELECT id, 1 - (embedding <=> CAST(? AS vector)) AS score "
            + "FROM knowledge_nodes "
            + "WHERE workspace_id = ? AND status = 'ACTIVE' AND embedding IS NOT NULL ");
        List<Object> args = new ArrayList<>();
        args.add(qLit);
        args.add(ws.getId());
        if (domain != null && !domain.isBlank()) {
            sql.append("AND domain = ? ");
            args.add(BrainEnums.domain(domain).name());
        }
        sql.append("ORDER BY embedding <=> CAST(? AS vector) ASC LIMIT ?");
        args.add(qLit);
        args.add(limit);

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), args.toArray());
        if (rows.isEmpty()) return List.of();

        Map<Long, Double> scoreById = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            scoreById.put(((Number) row.get("id")).longValue(), ((Number) row.get("score")).doubleValue());
        }
        Map<Long, KnowledgeNode> nodesById = new HashMap<>();
        nodeRepository.findAllById(scoreById.keySet()).forEach(n -> nodesById.put(n.getId(), n));

        List<KnowledgeSearchHit> hits = new ArrayList<>();
        scoreById.forEach((id, score) -> {
            KnowledgeNode n = nodesById.get(id);
            if (n != null) hits.add(KnowledgeSearchHit.builder()
                .node(BrainMapper.toNodeResponse(n)).score(score).build());
        });
        return hits;
    }

    /**
     * Retrieval interne pour l'assistant IA (sans contrôle d'accès : l'appelant a déjà
     * autorisé le workspace).
     */
    @Transactional
    public List<KnowledgeNode> retrieveRelevant(Long workspaceId, String query, int topK) {
        backfillMissingEmbeddings(workspaceId);
        float[] qvec = embeddingClient.embed(query);
        if (qvec == null) return List.of();
        String qLit = EmbeddingClient.toVectorLiteral(qvec);
        int limit = Math.max(1, Math.min(topK, 20));

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT id FROM knowledge_nodes WHERE workspace_id = ? AND status = 'ACTIVE' "
            + "AND embedding IS NOT NULL ORDER BY embedding <=> CAST(? AS vector) ASC LIMIT ?",
            workspaceId, qLit, limit);
        List<Long> ids = rows.stream().map(r -> ((Number) r.get("id")).longValue()).toList();
        if (ids.isEmpty()) return List.of();

        Map<Long, KnowledgeNode> byId = new HashMap<>();
        nodeRepository.findAllById(ids).forEach(n -> byId.put(n.getId(), n));
        return ids.stream().map(byId::get).filter(n -> n != null).toList();
    }

    // =========================================================================
    // Indexation (appelée par KnowledgeService à l'écriture)
    // =========================================================================

    /** Embedde et stocke le vecteur d'un node (best-effort). */
    public void embedNode(KnowledgeNode node) {
        float[] vec = embeddingClient.embed(embeddingText(node.getTitle(), node.getContent()));
        if (vec == null) return;
        try {
            jdbcTemplate.update(
                "UPDATE knowledge_nodes SET embedding = CAST(? AS vector) WHERE id = ?",
                EmbeddingClient.toVectorLiteral(vec), node.getId());
        } catch (Exception ex) {
            log.warn("Impossible d'écrire l'embedding du node {}: {}", node.getId(), ex.getMessage());
        }
    }

    /**
     * Indexe les embeddings manquants (seeds, anciens nodes). Borné ({@value #BACKFILL_BATCH}/appel) ;
     * rendu peu coûteux par l'index partiel {@code idx_knodes_missing_embedding} (V53) qui évite
     * tout scan complet quand rien ne manque.
     */
    public void backfillMissingEmbeddings(Long workspaceId) {
        List<Map<String, Object>> missing = jdbcTemplate.queryForList(
            "SELECT id, title, content FROM knowledge_nodes "
            + "WHERE workspace_id = ? AND embedding IS NULL LIMIT " + BACKFILL_BATCH, workspaceId);
        if (missing.isEmpty()) return;

        List<String> texts = missing.stream()
            .map(r -> embeddingText((String) r.get("title"), (String) r.get("content")))
            .toList();
        List<float[]> vectors = embeddingClient.embedBatch(texts);
        if (vectors == null || vectors.size() != missing.size()) return;

        for (int i = 0; i < missing.size(); i++) {
            Long id = ((Number) missing.get(i).get("id")).longValue();
            try {
                jdbcTemplate.update(
                    "UPDATE knowledge_nodes SET embedding = CAST(? AS vector) WHERE id = ?",
                    EmbeddingClient.toVectorLiteral(vectors.get(i)), id);
            } catch (Exception ex) {
                log.warn("Backfill embedding échoué pour node {}: {}", id, ex.getMessage());
            }
        }
        log.info("Backfill embeddings : {} nodes indexés (workspace {})", missing.size(), workspaceId);
    }

    /** Texte indexé = titre + contenu (tronqué pour rester raisonnable). */
    private String embeddingText(String title, String content) {
        String t = title != null ? title : "";
        String c = content != null ? content : "";
        String combined = (t + "\n" + c).strip();
        return combined.length() > 4000 ? combined.substring(0, 4000) : combined;
    }
}
