package com.taskforce.tf_api.core.service.agent;

import java.util.regex.Pattern;

/**
 * « Tu t'es trompé de projet » (R135, séance n°20 ; l'étape 15 de la recette : la même carte revenait, avec une description
 * inventée, « Issue créée par erreur dans le mauvais projet »). La phrase se reconnaît ici, par le code, en français et en
 * anglais : elle ouvre le choix du projet, sans passer par le modèle.
 */
public final class ProjectCorrection {

    private static final Pattern SAID = Pattern.compile(
        "tromp\\p{L}*\\s+de\\s+projet"
            + "|mauvais\\s+projet"
            + "|(?:pas|plus)\\s+(?:dans\\s+)?(?:le|ce|la)\\s+(?:bon\\s+|m[eê]me\\s+)?projet"
            + "|pas\\s+(?:le\\s+)?bon\\s+projet"
            + "|(?:dans|sur)\\s+(?:un\\s+)?autre\\s+projet"
            + "|change[rz]?\\s+(?:de|le)\\s+projet"
            + "|wrong\\s+project"
            + "|not\\s+(?:in\\s+)?(?:the\\s+right|the\\s+correct|that|this)\\s+project"
            + "|(?:in|to)\\s+(?:another|a\\s+different|the\\s+other)\\s+project"
            + "|change\\s+the\\s+project",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private ProjectCorrection() {
    }

    /** Vrai : la personne dit que le projet n'est pas le bon. */
    public static boolean asks(String message) {
        return message != null && SAID.matcher(message.replace('’', '\'')).find();
    }
}
