package com.taskforce.tf_api.core.desktop;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.taskforce.tf_api.shared.exception.BusinessException;

@DisplayName("DesktopProjectRepoHost : le dépôt d'un projet passe par le GitHub CLI de la personne")
class DesktopProjectRepoHostTest {

    private final DesktopProjectRepoHost host = new DesktopProjectRepoHost();

    @Test
    @DisplayName("lier un dépôt ne demande pas l'intégration GitHub de l'espace : la coque a vérifié l'accès avec gh")
    void linking_needs_no_workspace_integration() {
        assertThatCode(() -> host.assertRepoAccessible("acme", "acme/website")).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("le backend ne crée pas de dépôt : la coque le crée avec gh, puis le lie")
    void creating_happens_on_this_computer() {
        assertThatThrownBy(() -> host.createRepo("acme", "website", true))
            .isInstanceOf(BusinessException.class)
            .hasMessage(DesktopProjectRepoHost.CREATED_ON_THIS_COMPUTER);
    }
}
