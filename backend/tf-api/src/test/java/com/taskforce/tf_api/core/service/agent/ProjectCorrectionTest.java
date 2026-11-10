package com.taskforce.tf_api.core.service.agent;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/** « Tu t'es trompé de projet » se reconnaît par le code (R135) ; le reste de la conversation n'y passe pas. */
@DisplayName("ProjectCorrection")
class ProjectCorrectionTest {

    @ParameterizedTest(name = "« {0} »")
    @ValueSource(strings = {
        "oui mais tu t'es trompe de projet",
        "tu t’es trompé de projet",
        "c'est pas le bon projet",
        "ce n'est pas le bon projet",
        "mauvais projet",
        "pas dans ce projet",
        "mets-le dans un autre projet",
        "change de projet",
        "changer le projet",
        "wrong project",
        "That's the wrong project!",
        "not the right project",
        "not in that project",
        "put it in another project",
        "move it to a different project",
        "change the project",
    })
    void recognizes(String message) {
        assertThat(ProjectCorrection.asks(message)).isTrue();
    }

    @ParameterizedTest(name = "« {0} »")
    @ValueSource(strings = {
        "Crée une issue Test",
        "Crée une issue dans le projet Atlas",
        "Create a new project",
        "Résume le projet",
        "what is in this project?",
    })
    void leaves_the_rest(String message) {
        assertThat(ProjectCorrection.asks(message)).isFalse();
    }

    @org.junit.jupiter.api.Test
    void says_nothing_without_a_message() {
        assertThat(ProjectCorrection.asks(null)).isFalse();
    }
}
