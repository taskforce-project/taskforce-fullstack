package com.taskforce.tf_api.core.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

@DisplayName("PasskeyConfig : origines admises pour les passkeys")
class PasskeyConfigTest {

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
        "https://app.taskforce-project.fr, https://app.taskforce-project.fr",
        "https://app.taskforce-project.fr/, https://app.taskforce-project.fr",
        "http://localhost:3000, http://localhost:3000",
        "http://localhost:5173/auth/login, http://localhost:5173",
    })
    @DisplayName("l'origine d'une adresse : schéma, hôte et port s'il n'est pas celui par défaut")
    void origin(String url, String expected) {
        assertThat(PasskeyConfig.origin(URI.create(url))).isEqualTo(expected);
    }

    @ParameterizedTest(name = "extra = \"{0}\"")
    @CsvSource(delimiter = '|', emptyValue = "", value = {
        "| 1",
        "http://localhost:5173| 2",
        " http://localhost:5173 , http://localhost:3000 | 2",
    })
    @DisplayName("l'adresse de la webapp, plus les origines de développement, sans doublon")
    void origins(String extra, int count) {
        assertThat(PasskeyConfig.origins(URI.create("http://localhost:3000"), extra == null ? "" : extra)).hasSize(count)
            .first().isEqualTo("http://localhost:3000");
    }
}
