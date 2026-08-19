package com.taskforce.tf_api.core.service.brain;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.enums.EdgeRelation;
import com.taskforce.tf_api.core.model.KnowledgeEdge;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.repository.KnowledgeEdgeRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;

import lombok.RequiredArgsConstructor;

/**
 * Moteur de liens façon Obsidian. À chaque écriture d'un node :
 *  - extrait les <b>#tags</b> du contenu (+ tags explicites) → stockés dans {@code metadata.tags} ;
 *  - extrait les <b>[[wikilinks]]</b> → matérialise des arêtes {@code REFERENCES} <i>auto</i>
 *    (re-synchronisées à chaque édition, sans toucher aux relations manuelles).
 *
 * C'est ce qui transforme les notes en réseau : le graphe se tisse depuis le contenu.
 */
@Service
@RequiredArgsConstructor
public class BrainLinkService {

    private final KnowledgeNodeRepository nodeRepository;
    private final KnowledgeEdgeRepository edgeRepository;

    private static final Pattern HASHTAG  = Pattern.compile("(?:^|[\\s(])#([\\p{L}0-9_/-]{1,40})");
    private static final Pattern WIKILINK = Pattern.compile("\\[\\[([^\\]]{1,300})\\]\\]");

    /**
     * Synchronise tags + wikilinks d'un node déjà persisté. Idempotent.
     *
     * @param node         node sauvegardé (id non null)
     * @param explicitTags tags fournis par l'UI (peut être null)
     */
    public void syncFromContent(KnowledgeNode node, List<String> explicitTags) {
        String content = node.getContent() != null ? node.getContent() : "";

        // ── Tags : explicites ∪ #hashtags du contenu ───────────────────────────
        Set<String> tags = new LinkedHashSet<>();
        if (explicitTags != null) {
            for (String t : explicitTags) {
                String n = normalizeTag(t);
                if (!n.isBlank()) tags.add(n);
            }
        }
        Matcher mt = HASHTAG.matcher(content);
        while (mt.find()) tags.add(normalizeTag(mt.group(1)));

        Map<String, Object> meta = new HashMap<>(node.getMetadata() != null ? node.getMetadata() : Map.of());
        meta.put("tags", new ArrayList<>(tags));
        node.setMetadata(meta);
        nodeRepository.save(node);

        // ── Wikilinks → arêtes auto REFERENCES ──────────────────────────────────
        Long workspaceId = node.getWorkspace().getId();
        // On repart de zéro pour les auto-edges sortants de ce node (re-sync propre).
        edgeRepository.deleteAll(edgeRepository.findByFromNodeIdAndAutoTrue(node.getId()));

        Set<String> titles = new LinkedHashSet<>();
        Matcher mw = WIKILINK.matcher(content);
        while (mw.find()) titles.add(mw.group(1).trim());

        for (String title : titles) {
            if (title.isBlank()) continue;
            nodeRepository.findFirstByWorkspaceIdAndTitleIgnoreCase(workspaceId, title).ifPresent(target -> {
                if (target.getId().equals(node.getId())) return; // pas d'auto-lien
                // Ne pas dupliquer une relation existante (manuelle) du même type.
                if (edgeRepository.existsByFromNodeIdAndToNodeIdAndRelationType(
                        node.getId(), target.getId(), EdgeRelation.REFERENCES)) {
                    return;
                }
                edgeRepository.save(KnowledgeEdge.builder()
                    .workspace(node.getWorkspace())
                    .fromNode(node)
                    .toNode(target)
                    .relationType(EdgeRelation.REFERENCES)
                    .weight(1.0)
                    .auto(true)
                    .createdBy(node.getUpdatedBy())
                    .build());
            });
        }
    }

    /** #Mon-Tag → "mon-tag". */
    private String normalizeTag(String raw) {
        String t = raw.trim();
        if (t.startsWith("#")) t = t.substring(1);
        return t.toLowerCase().replaceAll("\\s+", "-");
    }
}
