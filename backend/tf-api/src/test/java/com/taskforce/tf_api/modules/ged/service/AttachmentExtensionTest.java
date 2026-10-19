package com.taskforce.tf_api.modules.ged.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

@DisplayName("AttachmentService.extensionOf — extension sûre dans la clé de stockage")
class AttachmentExtensionTest {

    @ParameterizedTest(name = "« {0} » → « {1} »")
    @CsvSource(value = {
        "rapport.pdf | .pdf",
        "Photo.JPEG | .jpeg",
        "archive.tar.gz | .gz",
        "sans-extension | ''",
        "point-final. | ''",
        "'a.x/../../y' | .y",
        "'a.p:d\\f' | .pdf",
        "a.abcdefghijklmnop | .abcdefghij",
        "'' | ''",
    }, delimiter = '|')
    @DisplayName("seules les lettres et les chiffres de l'extension sont gardés")
    void extension(String name, String expected) {
        assertThat(AttachmentService.extensionOf(name)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "nom absent → pas d'extension")
    @CsvSource(value = {"NULL"}, nullValues = "NULL")
    void no_name(String name) {
        assertThat(AttachmentService.extensionOf(name)).isEmpty();
    }
}
