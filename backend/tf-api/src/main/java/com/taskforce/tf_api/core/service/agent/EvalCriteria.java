package com.taskforce.tf_api.core.service.agent;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Les critères d'un cas de la banque, vérifiés par du code, jamais par un modèle.
 *
 * <ul>
 *   <li>{@code tool} : l'outil que le modèle doit appeler ; {@link #NO_TOOL} s'il ne doit en appeler aucun ; vide si le cas
 *       ne porte pas sur un outil.</li>
 *   <li>{@code args} : pour cet outil, les valeurs acceptées de chaque argument (la casse ne compte pas).</li>
 *   <li>{@code effect} : ce que la règle de l'espace doit décider de cet appel (allow, ask, deny), s'il est donné.</li>
 *   <li>{@code forbid} : les outils que le modèle ne doit pas appeler.</li>
 *   <li>{@code contains}, {@code notContains} : des mots attendus ou interdits dans sa réponse.</li>
 * </ul>
 */
public record EvalCriteria(String tool, Map<String, List<String>> args, String effect, List<String> forbid,
                           List<String> contains, List<String> notContains) {

    public static final String NO_TOOL = "none";

    public EvalCriteria {
        tool = tool == null ? "" : tool.strip();
        effect = effect == null ? "" : effect.strip();
        Map<String, List<String>> copy = new LinkedHashMap<>();
        if (args != null) args.forEach((key, values) -> copy.put(key, values == null ? List.of() : List.copyOf(values)));
        args = Collections.unmodifiableMap(copy); // l'ordre des arguments reste celui du cas : la note se relit pareil
        forbid = forbid == null ? List.of() : List.copyOf(forbid);
        contains = contains == null ? List.of() : List.copyOf(contains);
        notContains = notContains == null ? List.of() : List.copyOf(notContains);
    }
}
