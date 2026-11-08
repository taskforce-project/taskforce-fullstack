package com.taskforce.tf_api.core.service.agent;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.service.ai.ContextBudget;

/**
 * Garde la boucle d'outils dans la fenêtre du modèle (TF-J1-13) : avant chaque appel, si les messages ne tiennent plus,
 * les résultats déjà lus, les plus anciens d'abord, ne gardent que leur début, avec une phrase qui le dit au modèle ; ce
 * qu'il vient de lire reste entier tant que c'est possible, puis se partage la place qui reste. En dernier recours,
 * l'historique le plus ancien ne part pas. Rien n'est coupé en silence : le modèle lit la marque, la personne la ligne
 * grise.
 *
 * <p>Aujourd'hui rien ne borne un résultat : un outil interne plafonne le sien, un serveur MCP non.</p>
 */
final class ToolLoopFit {

    /** Ce qu'un résultat déjà lu garde de son début. */
    static final int KEPT_CHARS = 400;
    /** Le moins qu'un résultat qui vient d'arriver peut garder. */
    private static final int MIN_CHARS = 200;
    /** Ce que l'enveloppe JSON d'un résultat pèse autour de son texte, en caractères. */
    private static final int MESSAGE_OVERHEAD = 96;
    /** Une part arrondie laisse parfois quelques jetons de trop : on repasse, deux fois au plus, sur ce qu'il reste. */
    private static final int SHARING_PASSES = 3;
    static final String SHORTENED = "\n[Shortened by TaskForce to fit the context window. Call the tool again if you need the rest.]";

    private final ObjectMapper mapper;
    /** Ce que les messages peuvent prendre : les outils ont leur part à côté. */
    private final int room;
    /** Où l'historique finit : le message de la demande, qui part toujours. */
    private int request;
    private final Set<Integer> shortened = new HashSet<>();
    private int leftOut;

    /**
     * @param history le nombre de messages d'historique, placés après les consignes (index 0) et avant la demande
     */
    ToolLoopFit(ObjectMapper mapper, ContextBudget budget, int history) {
        this.mapper = mapper;
        this.room = budget.capacity() - budget.tools();
        this.request = 1 + history;
    }

    /** Les résultats d'outils raccourcis jusqu'ici. */
    int shortened() {
        return shortened.size();
    }

    /** Les messages d'historique qui n'ont pas pu partir. */
    int leftOut() {
        return leftOut;
    }

    /**
     * Fait tenir {@code messages}, sur place.
     *
     * @return faux si rien n'y fait : ce qui reste (les consignes, la demande, les appels d'outils) dépasse encore
     */
    boolean apply(List<Map<String, Object>> messages) {
        int over = size(messages) - room;
        if (over <= 0) {
            return true;
        }
        int latest = latestCalls(messages);
        for (int i = request + 1; i < latest && over > 0; i++) {
            if (isToolResult(messages.get(i))) {
                over -= shorten(messages, i, KEPT_CHARS);
            }
        }
        for (int pass = 0; pass < SHARING_PASSES && over > 0; pass++) {
            int saved = shareLatest(messages, latest, over);
            if (saved == 0) {
                break;
            }
            over -= saved;
        }
        for (int i = 1; i < request && over > 0; ) {
            if ("system".equals(messages.get(i).get("role"))) {
                i++; // le résumé glissant : il pèse peu et remplace bien plus que lui
                continue;
            }
            over -= ContextBudget.tokensOf(mapper, messages.remove(i));
            request--;
            leftOut++;
        }
        return over <= 0;
    }

    /** Les résultats qui viennent d'arriver gardent chacun la même part de ce qu'il reste, leur début ; le gain en jetons. */
    private int shareLatest(List<Map<String, Object>> messages, int latest, int over) {
        int tokens = 0;
        for (int i = latest + 1; i < messages.size(); i++) {
            if (isToolResult(messages.get(i))) {
                tokens += ContextBudget.tokensOf(mapper, messages.get(i));
            }
        }
        if (tokens == 0) {
            return 0;
        }
        double share = Math.max(0, tokens - over) / (double) tokens;
        int saved = 0;
        for (int i = latest + 1; i < messages.size(); i++) {
            if (isToolResult(messages.get(i))) {
                int chars = (int) (String.valueOf(messages.get(i).get("content")).length() * share) - SHORTENED.length() - MESSAGE_OVERHEAD;
                saved += shorten(messages, i, Math.max(MIN_CHARS, chars));
            }
        }
        return saved;
    }

    /** Le message d'index {@code i} ne garde que {@code chars} caractères ; les jetons gagnés. */
    private int shorten(List<Map<String, Object>> messages, int i, int chars) {
        Map<String, Object> message = messages.get(i);
        String content = String.valueOf(message.get("content"));
        if (content.length() <= chars + SHORTENED.length()) {
            return 0;
        }
        Map<String, Object> kept = new LinkedHashMap<>(message);
        kept.put("content", content.substring(0, chars) + SHORTENED);
        messages.set(i, kept);
        shortened.add(i);
        return ContextBudget.tokensOf(mapper, message) - ContextBudget.tokensOf(mapper, kept);
    }

    private int size(List<Map<String, Object>> messages) {
        return messages.stream().mapToInt(message -> ContextBudget.tokensOf(mapper, message)).sum();
    }

    /** L'index du dernier message du modèle qui appelle des outils ; ses résultats sont ce qu'il vient de lire. */
    private int latestCalls(List<Map<String, Object>> messages) {
        for (int i = messages.size() - 1; i > request; i--) {
            if ("assistant".equals(messages.get(i).get("role")) && messages.get(i).containsKey("tool_calls")) {
                return i;
            }
        }
        return request;
    }

    private static boolean isToolResult(Map<String, Object> message) {
        return "tool".equals(message.get("role"));
    }
}
