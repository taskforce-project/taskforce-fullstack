package com.taskforce.tf_api.core.service.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * L'historique d'un tour, choisi au dernier moment : seul le budget de la requête dit ce qui tient, et il dépend du modèle
 * qui répond, de ses outils et de ce que la personne a joint (TF-J1-13).
 */
@FunctionalInterface
public interface TurnHistory {

    /**
     * Ce qui part avec la requête, et ce qui lui est arrivé pour tenir.
     *
     * @param messages   l'historique à envoyer, en ordre chronologique (le résumé glissant d'abord, s'il y en a un)
     * @param summarized les messages condensés pour ce tour
     * @param leftOut    les messages (ou le résumé) qui n'ont pas pu partir
     */
    record Fitted(List<Map<String, Object>> messages, int summarized, int leftOut) {

        public static final Fitted NONE = new Fitted(List.of(), 0, 0);
    }

    /**
     * L'historique que ce budget laisse partir.
     *
     * @param budget le budget de la requête
     * @param tier   le palier de la requête : un résumé écrit pour elle prend le même modèle
     */
    Fitted fit(ContextBudget budget, String tier);

    /** Un historique tout fait, en ordre chronologique : les messages les plus récents qui tiennent, rien de condensé. */
    static TurnHistory of(List<Map<String, Object>> messages) {
        return (budget, tier) -> {
            int[] sizes = messages.stream().mapToInt(message -> ContextBudget.tokens(String.valueOf(message.get("content")))).toArray();
            int kept = ContextBudget.keepNewest(sizes, budget.historyRoom());
            return new Fitted(new ArrayList<>(messages.subList(messages.size() - kept, messages.size())), 0, messages.size() - kept);
        };
    }
}
