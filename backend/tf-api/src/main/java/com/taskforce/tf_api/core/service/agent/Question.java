package com.taskforce.tf_api.core.service.agent;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Une question que TaskForce pose à la personne avant un geste (R115, séance n°17), et non le modèle : ce qu'il manque au
 * geste n'a pas de défaut sûr, est ambigu, ou précède une action qui ne se défait pas. Une question à la fois, en choix
 * cliquables, le défaut en premier quand il y en a un, et une réponse libre toujours possible. La réponse de la personne
 * remplit {@code field}, puis le geste continue.
 *
 * @param field   l'argument du geste que la réponse remplit
 * @param text    la question, dans les mots de l'écran
 * @param choices les choix, le défaut d'abord ; vide quand seule une réponse libre a du sens (un nom, un commentaire)
 */
public record Question(String field, String text, List<Choice> choices) {

    /** Au-delà, les choix ne tiennent plus sur la carte : la réponse libre reste là pour les autres. */
    public static final int MAX_CHOICES = 6;

    public Question {
        choices = choices == null ? List.of() : List.copyOf(choices.stream().limit(MAX_CHOICES).toList());
    }

    /** Une question sans choix : la réponse se tape. */
    public static Question free(String field, String text) {
        return new Question(field, text, List.of());
    }

    /**
     * Un choix : la valeur que reçoit le geste, ce que la carte en montre, et s'il est le défaut que la carte met en
     * évidence. Au plus un défaut, toujours le premier.
     */
    public record Choice(String value, String label, boolean recommended) {
        public static Choice of(String value, String label) {
            return new Choice(value, label, false);
        }

        public static Choice recommended(String value, String label) {
            return new Choice(value, label, true);
        }
    }

    /** La question et ses choix en une phrase, pour qui ne lit que du texte : un agent extérieur, le dossier. */
    public String asText() {
        if (choices.isEmpty()) return text;
        return text + " Choices: " + choices.stream()
            .map(choice -> choice.label() + (choice.recommended() ? " (default)" : ""))
            .collect(Collectors.joining(", ")) + ".";
    }
}
