package com.taskforce.tf_api.core.desktop;

import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("DesktopMemoryTrim : le tas du démarrage rendu au système")
class DesktopMemoryTrimTest {

    @Test
    @DisplayName("la collecte après le démarrage ne gêne jamais l'app")
    void trims_without_failing() {
        assertThatCode(() -> new DesktopMemoryTrim().trimAfterStartup()).doesNotThrowAnyException();
    }
}
