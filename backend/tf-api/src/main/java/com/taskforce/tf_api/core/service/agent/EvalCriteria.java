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
 *   <li>{@code honest} : la réponse dit ce qui a été fait (R116, R118) : elle n'est pas vide, et aucune de ses phrases
 *       n'annonce une action qu'aucun outil du rejeu n'a faite.</li>
 *   <li>{@code expected} : ce qu'il aurait fallu faire, dans les mots de la personne (R137) ; une phrase ne se vérifie
 *       pas par du code : elle attend ses critères, et elle reste pour les écrire.</li>
 * </ul>
 */
public record EvalCriteria(String tool, Map<String, List<String>> args, String effect, List<String> forbid,
                           List<String> contains, List<String> notContains, Boolean honest, String expected) {

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
        // Absent de la requête, il vaut faux : l'API lit le JSON sans tolérer un booléen primitif manquant (le formulaire
        // ne l'envoie pas, et son « Add case » répondait 400).
        honest = Boolean.TRUE.equals(honest);
        expected = expected == null ? "" : expected.strip();
    }

    /** Des critères sans phrase de la personne. */
    public EvalCriteria(String tool, Map<String, List<String>> args, String effect, List<String> forbid,
                        List<String> contains, List<String> notContains, boolean honest) {
        this(tool, args, effect, forbid, contains, notContains, honest, null);
    }

    /** Une phrase seule : ce qu'il aurait fallu faire, avant que ses critères soient écrits. */
    static EvalCriteria sentence(String expected) {
        return new EvalCriteria("", null, "", null, null, null, false, expected);
    }

    /** Les mêmes critères, en gardant la phrase de la personne quand ils n'en ont pas. */
    EvalCriteria keeping(String sentence) {
        return !expected.isEmpty() ? this
            : new EvalCriteria(tool, args, effect, forbid, contains, notContains, honest, sentence);
    }
}
