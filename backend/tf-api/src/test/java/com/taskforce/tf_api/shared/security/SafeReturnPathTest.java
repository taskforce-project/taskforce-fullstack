package com.taskforce.tf_api.shared.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Chemin de retour après un flux OAuth : seul un chemin relatif à l'application, dans le workspace du
 * flux, est gardé. Tout le reste rend null (l'appelant retombe sur sa destination par défaut).
 */
@DisplayName("SafeReturnPath")
class SafeReturnPathTest {

    @ParameterizedTest(name = "gardé : {0}")
    @ValueSource(strings = {
        "/acme",
        "/acme?newProject=repo",
        "/acme/projects",
        "/acme/projects/12?issue=5",
        "/acme/settings?section=integrations&tab=github",
    })
    void keeps_paths_inside_the_workspace(String path) {
        assertThat(SafeReturnPath.withinWorkspace(path, "acme")).isEqualTo(path);
    }

    @ParameterizedTest(name = "écarté : [{0}]")
    @CsvSource(value = {
        // Ailleurs que dans l'application
        "https://evil.example/acme",
        "//evil.example/acme",
        "/\\evil.example",
        "/acme/../../evil",
        "/acme@evil.example",
        "javascript:alert(1)",
        "/acme?next=https://evil.example",
        // Encodage qui masquerait l'un des cas ci-dessus
        "/acme/%2e%2e/other",
        "/acme%2f..%2fother",
        // Hors du workspace du flux
        "/other",
        "/other/projects",
        "/acme-evil",
        "/acmeX?newProject=repo",
        "/",
        // Forme
        "acme",
        "''",
        "'   '",
    })
    void drops_everything_else(String path) {
        assertThat(SafeReturnPath.withinWorkspace(path, "acme")).isNull();
    }

    @ParameterizedTest(name = "caractère de contrôle écarté (code {0})")
    @ValueSource(ints = { 0x09, 0x0a, 0x0d, 0x00, 0x7f, 0xe9 })
    void drops_control_and_non_ascii_characters(int codePoint) {
        assertThat(SafeReturnPath.withinWorkspace("/acme/x" + (char) codePoint + "y", "acme")).isNull();
    }

    @org.junit.jupiter.api.Test
    @DisplayName("null, trop long, ou sans workspace : écarté")
    void drops_null_long_or_missing_workspace() {
        assertThat(SafeReturnPath.withinWorkspace(null, "acme")).isNull();
        assertThat(SafeReturnPath.withinWorkspace("/acme/" + "a".repeat(400), "acme")).isNull();
        assertThat(SafeReturnPath.withinWorkspace("/acme", null)).isNull();
        assertThat(SafeReturnPath.withinWorkspace("/acme", " ")).isNull();
    }

    @org.junit.jupiter.api.Test
    @DisplayName("les espaces autour sont retirés")
    void trims() {
        assertThat(SafeReturnPath.withinWorkspace("  /acme?newProject=repo ", "acme")).isEqualTo("/acme?newProject=repo");
    }
}
