package com.taskforce.tf_api.core.desktop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.keycloak.representations.idm.UserRepresentation;

import com.taskforce.tf_api.shared.exception.BusinessException;

@DisplayName("DesktopAccountDirectory — annuaire du seul compte connecté")
class DesktopAccountDirectoryTest {

    private static final DesktopAccountDirectory DIRECTORY = new DesktopAccountDirectory(
        new DesktopProperties("tfd_" + "a".repeat(40), "C:/data",
            new DesktopProperties.Account("kc-sub-1", "Ada@Example.com", "Ada", "Trial", null)));

    @Test
    @DisplayName("le compte connecté se lit par identifiant, comme chez Keycloak")
    void reads_the_account_by_id() {
        UserRepresentation user = DIRECTORY.getUserById("kc-sub-1");

        assertThat(user.getId()).isEqualTo("kc-sub-1");
        assertThat(user.getEmail()).isEqualTo("Ada@Example.com");
        assertThat(user.getFirstName()).isEqualTo("Ada");
        assertThat(user.getLastName()).isEqualTo("Trial");
        assertThat(user.isEnabled()).isTrue();
        assertThat(user.isEmailVerified()).isTrue();
    }

    @ParameterizedTest(name = "« {0} » → {1}")
    @CsvSource({
        "ada@example.com, true",
        "  ADA@example.COM , true",
        "bob@example.com, false",
    })
    @DisplayName("seule l'adresse du compte existe, sans tenir compte de la casse")
    void email_exists(String email, boolean expected) {
        assertThat(DIRECTORY.emailExists(email)).isEqualTo(expected);
    }

    @Test
    @DisplayName("un autre compte n'existe pas ici")
    void other_accounts_are_unknown() {
        assertThat(DIRECTORY.emailExists(null)).isFalse();
        assertThatThrownBy(() -> DIRECTORY.getUserById("kc-sub-2")).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> DIRECTORY.getUserByEmail("bob@example.com")).isInstanceOf(RuntimeException.class);
        assertThat(DIRECTORY.getUserByEmail("ada@example.com").getId()).isEqualTo("kc-sub-1");
    }

    static Stream<Arguments> accountChanges() {
        return Stream.of(
            Arguments.of("création", (Executable) () -> DIRECTORY.createUser("x@example.com", "pw", "X", "Y")),
            Arguments.of("vérification d'adresse", (Executable) () -> DIRECTORY.verifyEmail("kc-sub-1")),
            Arguments.of("mot de passe", (Executable) () -> DIRECTORY.updatePassword("kc-sub-1", "pw")),
            Arguments.of("activation", (Executable) () -> DIRECTORY.setUserEnabled("kc-sub-1", false)),
            Arguments.of("nom", (Executable) () -> DIRECTORY.updateUserNames("kc-sub-1", "A", "B")),
            Arguments.of("suppression", (Executable) () -> DIRECTORY.deleteUser("kc-sub-1")));
    }

    @ParameterizedTest(name = "{0} : sur la page du compte")
    @MethodSource("accountChanges")
    @DisplayName("ce qui change le compte lui-même se fait sur la page du compte hébergé")
    void account_changes_are_refused(String label, Executable change) {
        assertThatThrownBy(change::execute)
            .isInstanceOf(BusinessException.class)
            .hasMessage(DesktopAccountDirectory.MANAGED_ON_ACCOUNT);
    }

    @Test
    @DisplayName("la déconnexion des sessions n'a rien à fermer")
    void logout_is_a_no_op() {
        assertThatCode(() -> DIRECTORY.logoutUser("kc-sub-1")).doesNotThrowAnyException();
    }
}
