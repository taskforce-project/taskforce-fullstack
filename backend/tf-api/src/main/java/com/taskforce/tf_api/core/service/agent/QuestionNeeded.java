package com.taskforce.tf_api.core.service.agent;

import java.util.List;
import java.util.stream.Collectors;

import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Le geste ne peut pas continuer sans les réponses de la personne (R115) : TaskForce pose ses questions, rien n'est
 * écrit. Deux au plus, dans la même carte (décision du CEO, 05/11/2026 : « deux questions au plus », le signal d'arrêt
 * de R115), et un seul envoi pour toutes leurs réponses. Dans la conversation, Cortex les montre en carte ; un agent
 * extérieur, par le serveur MCP, les lit comme une erreur d'outil qui dit chaque question et ses choix, pour les poser
 * à sa personne.
 */
public class QuestionNeeded extends BusinessException {

    /** Les questions d'une carte : au-delà de deux pour une demande courante, R115 dit que la piste est fausse. */
    public static final int MAX_QUESTIONS = 2;

    private final transient List<Question> questions;

    public QuestionNeeded(Question question) {
        this(List.of(question));
    }

    public QuestionNeeded(List<Question> questions) {
        super("QUESTION_NEEDED", asText(questions));
        if (questions.isEmpty()) throw new IllegalArgumentException("A card asks at least one question");
        this.questions = questions.stream().limit(MAX_QUESTIONS).toList();
    }

    /** Les questions de la carte, dans l'ordre où la personne les lit : une ou deux. */
    public List<Question> questions() {
        return questions;
    }

    /** La première question de la carte, la seule de la plupart. */
    public Question question() {
        return questions.get(0);
    }

    private static String asText(List<Question> questions) {
        return questions.stream().limit(MAX_QUESTIONS).map(Question::asText).collect(Collectors.joining(" "));
    }
}
