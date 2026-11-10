package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

/**
 * Une question que TaskForce pose à la personne avant un geste (R115, séance n°17), et non le modèle : ce qu'il manque au
 * geste n'a pas de défaut sûr, est ambigu, ou précède une action qui ne se défait pas. Elle a la forme des questions de
 * Claude (décision du CEO, 05/11/2026 : « comme sur Claude ») : un titre court, la question, deux à quatre choix dont
 * chacun se dit en une ligne, le choix recommandé en premier, et une réponse libre toujours possible (« Other »). Une
 * carte en porte deux au plus ({@link QuestionNeeded}). La réponse de la personne remplit {@code field}, puis le geste
 * continue.
 *
 * @param field    l'argument du geste que la réponse remplit
 * @param header   le titre court de la question sur la carte (« Name », « Repository »)
 * @param text     la question, dans les mots de l'écran
 * @param multiple plusieurs choix se cochent : les réponses ne s'excluent pas (les labels d'une issue) ; la réponse
 *                 remplit alors une liste
 * @param choices  les choix, le recommandé d'abord ; vide quand seule une réponse libre a du sens (un nom, un commentaire)
 */
public record Question(String field, String header, String text, boolean multiple, List<Choice> choices) {

    /** Comme sur Claude : au-delà de quatre choix, la carte ne se lit plus d'un coup d'œil ; « Other » reste là. */
    public static final int MAX_CHOICES = 4;

    /**
     * L'argument où le serveur note, à chaque envoi d'une carte, les questions auxquelles la personne a répondu (leurs
     * {@code field}, une fois par réponse). Le geste qui reprend sait ainsi qu'une valeur vient d'elle et ne la redemande
     * jamais, et qu'une carte a déjà été montrée (test du CEO du 05/11/2026 : la même carte revenait sur une réponse
     * tapée). Seul le serveur l'écrit : celui que passerait le modèle est retiré.
     */
    public static final String ANSWERED = "answered";

    public Question {
        choices = choices == null ? List.of() : List.copyOf(choices.stream().limit(MAX_CHOICES).toList());
    }

    /** Une question à un seul choix. */
    public static Question of(String field, String header, String text, List<Choice> choices) {
        return new Question(field, header, text, false, choices);
    }

    /** Une question dont plusieurs choix se cochent. */
    public static Question several(String field, String header, String text, List<Choice> choices) {
        return new Question(field, header, text, true, choices);
    }

    /** Une question sans choix : la réponse se tape. */
    public static Question free(String field, String header, String text) {
        return new Question(field, header, text, false, List.of());
    }

    /**
     * La même question, une suggestion en premier (le nom que le modèle a proposé, que la demande ne dit pas) : une
     * suggestion n'est pas recommandée, et un choix qui dit la même chose ne se répète pas.
     */
    public Question suggesting(Choice suggestion) {
        List<Choice> all = new ArrayList<>();
        all.add(suggestion);
        String said = suggestion.value().strip().toLowerCase(Locale.ROOT);
        choices.stream().filter(choice -> !choice.value().strip().toLowerCase(Locale.ROOT).equals(said)).forEach(all::add);
        return new Question(field, header, text, multiple, all);
    }

    /**
     * Un choix : la valeur que reçoit le geste, ce que la carte en montre, ce qu'il veut dire en une ligne (null quand le
     * libellé suffit), et s'il est recommandé, ce que la carte met en évidence et coche d'avance. Le recommandé vient
     * toujours en premier.
     */
    public record Choice(String value, String label, String description, boolean recommended) {
        public static Choice of(String value, String label, String description) {
            return new Choice(value, label, description, false);
        }

        public static Choice of(String value, String label) {
            return of(value, label, null);
        }

        public static Choice recommended(String value, String label, String description) {
            return new Choice(value, label, description, true);
        }

        public static Choice recommended(String value, String label) {
            return recommended(value, label, null);
        }
    }

    /**
     * Ce que la personne a répondu à une question de la carte : les valeurs des choix qu'elle a cochés, et ce qu'elle a
     * tapé dans « Other ». Ses clics et ses mots sur la carte, jamais une décision lue dans un message (R1).
     */
    public record Answer(String field, List<String> values, String other) {
        public Answer {
            values = values == null ? List.of() : values.stream()
                .filter(value -> value != null && !value.isBlank()).map(String::strip).distinct().toList();
            other = other == null ? "" : other.strip();
        }
    }

    /** La question et ses choix en une phrase, pour qui ne lit que du texte : un agent extérieur, le dossier. */
    public String asText() {
        if (choices.isEmpty()) return text;
        return text + (multiple ? " Choices, several possible: " : " Choices: ") + choices.stream()
            .map(choice -> choice.label() + (choice.recommended() ? " (recommended)" : ""))
            .collect(Collectors.joining(", ")) + ".";
    }
}
