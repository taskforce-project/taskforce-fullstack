package com.taskforce.tf_api.core.service.brain;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.taskforce.tf_api.core.dto.response.KnowledgeSearchHit;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.service.EmbeddingClient;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Recherche dans le Brain OS : sémantique (pgvector) quand un modèle d'embeddings est disponible, plein
 * texte (PostgreSQL) sinon. L'IA est un plus, pas une condition : sans fournisseur, la recherche marche.
 *
 * <p><b>Aucune transaction n'englobe l'appel au modèle.</b> Le calcul du vecteur de la requête (HTTP vers
 * l'ai-service, jusqu'à 60 s sur un modèle local) se fait avant ; seules la lecture et la mise en forme des
 * notes trouvées se font dans une transaction courte. Les vecteurs des notes sont calculés en tâche de fond
 * par {@link BrainEmbeddingIndexer}, jamais pendant une requête de l'utilisateur.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BrainSearchService {

    private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{N}]{2,}");
    private static final int MAX_TERMS = 8;

    private final KnowledgeNodeRepository nodeRepository;
    private final EmbeddingClient         embeddingClient;
    private final JdbcTemplate            jdbcTemplate;
    private final BrainAccessGuard        access;
    private final TransactionTemplate     transactionTemplate;

    /** Une note trouvée et son score (0..1). */
    private record Hit(long id, double score) {}

    /** Une note retrouvée avec son score de similarité (0..1). */
    public record ScoredNode(KnowledgeNode node, double score) {}

    // =========================================================================
    // Recherche (exposée au controller)
    // =========================================================================

    public List<KnowledgeSearchHit> search(String slug, Long userId, String query, Integer topK, String domain) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        int limit = Math.max(1, Math.min(topK != null ? topK : 8, 50));
        String domainFilter = (domain != null && !domain.isBlank()) ? BrainEnums.domain(domain).name() : null;

        List<Hit> hits = rank(ws.getId(), query, limit, domainFilter);
        if (hits.isEmpty()) return List.of();

        return transactionTemplate.execute(status -> {
            Map<Long, KnowledgeNode> byId = loadNodes(hits);
            List<KnowledgeSearchHit> out = new ArrayList<>();
            for (Hit hit : hits) {
                KnowledgeNode n = byId.get(hit.id());
                if (n != null) out.add(KnowledgeSearchHit.builder()
                    .node(BrainMapper.toNodeResponse(n)).score(hit.score()).build());
            }
            return out;
        });
    }

    /**
     * Notes pertinentes pour l'assistant IA (sans contrôle d'accès : l'appelant a déjà autorisé le workspace).
     */
    public List<KnowledgeNode> retrieveRelevant(Long workspaceId, String query, int topK) {
        return retrieveRelevantScored(workspaceId, query, topK).stream().map(ScoredNode::node).toList();
    }

    /**
     * Comme {@link #retrieveRelevant} mais expose le score (pour l'affichage « déjà vu ? »).
     * Sans contrôle d'accès : l'appelant a déjà autorisé le workspace.
     */
    public List<ScoredNode> retrieveRelevantScored(Long workspaceId, String query, int topK) {
        List<Hit> hits = rank(workspaceId, query, Math.max(1, Math.min(topK, 20)), null);
        if (hits.isEmpty()) return List.of();
        Map<Long, KnowledgeNode> byId = transactionTemplate.execute(status -> loadNodes(hits));
        List<ScoredNode> out = new ArrayList<>();
        for (Hit hit : hits) {
            KnowledgeNode n = byId.get(hit.id());
            if (n != null) out.add(new ScoredNode(n, hit.score()));
        }
        return out;
    }

    // =========================================================================
    // Réindexation (appelée à l'écriture d'une note)
    // =========================================================================

    /**
     * Marque une note à réindexer après une modification de son contenu : son vecteur, devenu faux, est
     * effacé, et {@link BrainEmbeddingIndexer} le recalcule en tâche de fond. S'exécute dans la transaction
     * de l'appelant (une écriture SQL, aucun appel réseau).
     */
    public void markForReindex(Long nodeId) {
        jdbcTemplate.update(
            "UPDATE knowledge_nodes SET embedding = NULL, embedding_model = NULL WHERE id = ?", nodeId);
    }

    // =========================================================================
    // Classement
    // =========================================================================

    /** Sémantique si un modèle d'embeddings répond et a déjà indexé des notes de ce workspace, sinon plein texte. */
    private List<Hit> rank(Long workspaceId, String query, int limit, String domain) {
        String model = embeddingClient.currentModel();
        if (model != null) {
            float[] qvec = embeddingClient.embed(query);
            if (qvec != null) {
                List<Hit> semantic = semanticHits(workspaceId, model, qvec, limit, domain);
                if (!semantic.isEmpty()) return semantic;
            }
        }
        return textHits(workspaceId, query, limit, domain);
    }

    private List<Hit> semanticHits(Long workspaceId, String model, float[] qvec, int limit, String domain) {
        String qLit = EmbeddingClient.toVectorLiteral(qvec);
        StringBuilder sql = new StringBuilder(
            "SELECT id, 1 - (embedding <=> CAST(? AS vector)) AS score FROM knowledge_nodes "
            + "WHERE workspace_id = ? AND status = 'ACTIVE' AND embedding IS NOT NULL AND embedding_model = ? ");
        List<Object> args = new ArrayList<>(List.of(qLit, workspaceId, model));
        if (domain != null) {
            sql.append("AND domain = ? ");
            args.add(domain);
        }
        sql.append("ORDER BY embedding <=> CAST(? AS vector) ASC LIMIT ?");
        args.add(qLit);
        args.add(limit);
        return toHits(jdbcTemplate.queryForList(sql.toString(), args.toArray()));
    }

    /**
     * Plein texte PostgreSQL (configuration {@code simple} : indépendante de la langue), sur le titre et le
     * contenu. Chaque mot de la requête compte, en préfixe ({@code mot:*}) ; le score est normalisé dans
     * [0, 1) ({@code ts_rank} option 32). Les mots ne gardent que lettres et chiffres : rien ne peut casser
     * la syntaxe de {@code to_tsquery}.
     */
    private List<Hit> textHits(Long workspaceId, String query, int limit, String domain) {
        List<String> terms = terms(query);
        if (terms.isEmpty()) return List.of();
        String tsquery = String.join(" | ", terms.stream().map(t -> t + ":*").toList());

        String document = "to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))";
        StringBuilder sql = new StringBuilder(
            "SELECT id, ts_rank(" + document + ", to_tsquery('simple', ?), 32) AS score FROM knowledge_nodes "
            + "WHERE workspace_id = ? AND status = 'ACTIVE' AND " + document + " @@ to_tsquery('simple', ?) ");
        List<Object> args = new ArrayList<>(List.of(tsquery, workspaceId, tsquery));
        if (domain != null) {
            sql.append("AND domain = ? ");
            args.add(domain);
        }
        sql.append("ORDER BY score DESC, id DESC LIMIT ?");
        args.add(limit);
        return toHits(jdbcTemplate.queryForList(sql.toString(), args.toArray()));
    }

    /** Mots de la requête (lettres et chiffres, deux caractères au moins), en minuscules, sans doublon. */
    static List<String> terms(String query) {
        Set<String> out = new LinkedHashSet<>();
        if (query != null) {
            Matcher m = WORD.matcher(query.toLowerCase(Locale.ROOT));
            while (m.find() && out.size() < MAX_TERMS) out.add(m.group());
        }
        return List.copyOf(out);
    }

    private static List<Hit> toHits(List<Map<String, Object>> rows) {
        return rows.stream()
            .map(r -> new Hit(((Number) r.get("id")).longValue(), ((Number) r.get("score")).doubleValue()))
            .toList();
    }

    private Map<Long, KnowledgeNode> loadNodes(List<Hit> hits) {
        Map<Long, KnowledgeNode> byId = new HashMap<>();
        nodeRepository.findAllById(hits.stream().map(Hit::id).toList()).forEach(n -> byId.put(n.getId(), n));
        return byId;
    }
}
