package com.taskforce.tf_api.core.desktop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

@DisplayName("DesktopConfig — réglages fournis par la coque et garde de l'en-tête Host")
class DesktopConfigTest {

    private static final String TOKEN = "tfd_" + "a".repeat(40);
    private static final DesktopProperties.Account ACCOUNT =
        new DesktopProperties.Account("sub-1", "ada@example.com", "Ada", "Trial", null);

    @Test
    @DisplayName("des réglages complets laissent démarrer")
    void complete_settings_pass() {
        assertThatCode(() -> DesktopConfig.validate(new DesktopProperties(TOKEN, "C:/data", ACCOUNT)))
            .doesNotThrowAnyException();
    }

    static Stream<Arguments> incompleteSettings() {
        return Stream.of(
            Arguments.of("sans jeton", new DesktopProperties(null, "C:/data", ACCOUNT)),
            Arguments.of("jeton sans préfixe tfd_", new DesktopProperties("x".repeat(48), "C:/data", ACCOUNT)),
            Arguments.of("jeton trop court", new DesktopProperties("tfd_short", "C:/data", ACCOUNT)),
            Arguments.of("sans compte", new DesktopProperties(TOKEN, "C:/data", null)),
            Arguments.of("compte sans identifiant", new DesktopProperties(TOKEN, "C:/data",
                new DesktopProperties.Account(" ", "ada@example.com", null, null, null))),
            Arguments.of("compte sans adresse", new DesktopProperties(TOKEN, "C:/data",
                new DesktopProperties.Account("sub-1", "", null, null, null))),
            Arguments.of("sans dossier de données", new DesktopProperties(TOKEN, " ", ACCOUNT)));
    }

    @ParameterizedTest(name = "{0} : démarrage refusé")
    @MethodSource("incompleteSettings")
    @DisplayName("des réglages incomplets arrêtent le démarrage")
    void incomplete_settings_stop_startup(String label, DesktopProperties properties) {
        assertThatThrownBy(() -> DesktopConfig.validate(properties)).isInstanceOf(IllegalStateException.class);
    }

    /** Ce que la coque pose au lancement (desktop/src/backend.ts) pour les réglages que le démarrage vérifie. */
    private static final Map<String, String> SHELL_VARIABLES = Map.of(
        "TF_DESKTOP_LAUNCH_TOKEN", TOKEN,
        "TF_DESKTOP_DATA_DIR", "C:/data",
        "TF_DESKTOP_ACCOUNT_SUBJECT", "sub-1",
        "TF_DESKTOP_ACCOUNT_EMAIL", "ada@example.com");

    /** Le vrai application-desktop.yml, lié à ces variables d'environnement seules, comme au démarrage. */
    private static DesktopProperties settingsOf(Map<String, String> variables) throws IOException {
        MockEnvironment environment = new MockEnvironment();
        variables.forEach(environment::setProperty);
        new YamlPropertySourceLoader().load("application-desktop", new ClassPathResource("application-desktop.yml"))
            .forEach(environment.getPropertySources()::addLast);
        return Binder.get(environment).bind("desktop", DesktopProperties.class).get();
    }

    @Test
    @DisplayName("toutes les variables de la coque présentes laissent démarrer")
    void all_shell_variables_pass() throws IOException {
        DesktopProperties settings = settingsOf(SHELL_VARIABLES);

        assertThat(settings.account().subject()).isEqualTo("sub-1");
        assertThatCode(() -> DesktopConfig.validate(settings)).doesNotThrowAnyException();
    }

    /** Sans défaut dans le YAML, Spring garderait le texte « ${VARIABLE} », qui n'est pas vide : le démarrage passerait. */
    @ParameterizedTest(name = "sans {0} : démarrage refusé")
    @ValueSource(strings = {
        "TF_DESKTOP_LAUNCH_TOKEN", "TF_DESKTOP_DATA_DIR", "TF_DESKTOP_ACCOUNT_SUBJECT", "TF_DESKTOP_ACCOUNT_EMAIL"
    })
    @DisplayName("une variable de la coque absente compte comme vide : le démarrage est refusé")
    void an_absent_shell_variable_stops_startup(String variable) throws IOException {
        Map<String, String> variables = new HashMap<>(SHELL_VARIABLES);
        variables.remove(variable);
        DesktopProperties settings = settingsOf(variables);

        assertThatThrownBy(() -> DesktopConfig.validate(settings)).isInstanceOf(IllegalStateException.class);
    }

    @ParameterizedTest(name = "Host {0} → {1}")
    @CsvSource({
        "127.0.0.1, 200",
        "localhost, 200",
        "evil.example, 403",
        "192.168.1.10, 403",
        "127.0.0.1.nip.io, 403",
    })
    @DisplayName("seules les requêtes adressées à la machine locale passent")
    void host_filter(String host, int status) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/users/me");
        request.setServerName(host);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        new DesktopConfig.LocalHostFilter().doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(status);
        assertThat(chain.getRequest() != null).isEqualTo(status == 200);
    }

    @Test
    @DisplayName("nom affiché : prénom et nom, sinon la partie locale de l'adresse")
    void display_name() {
        assertThat(ACCOUNT.displayName()).isEqualTo("Ada Trial");
        assertThat(new DesktopProperties.Account("s", "ada.lovelace@example.com", null, " ", null).displayName())
            .isEqualTo("ada.lovelace");
    }
}
