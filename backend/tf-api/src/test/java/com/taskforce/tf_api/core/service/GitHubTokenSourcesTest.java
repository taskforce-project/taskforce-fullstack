package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.repository.IntegrationRepository;

/** Sur le serveur, le jeton GitHub est celui de la connexion GitHub de l'espace. */
@DisplayName("WorkspaceGitHubTokenSource")
class GitHubTokenSourcesTest {

    private final IntegrationRepository integrations = mock(IntegrationRepository.class);
    private final WorkspaceGitHubTokenSource tokens = new WorkspaceGitHubTokenSource(integrations);

    @ParameterizedTest(name = "jeton « {0} » → « {1} »")
    @CsvSource(value = {"gho_workspace, gho_workspace", "'  ', NULL"}, nullValues = "NULL")
    @DisplayName("le jeton de la connexion GitHub de l'espace")
    void the_workspace_connection(String stored, String expected) {
        when(integrations.findByWorkspaceIdAndProvider(3L, IntegrationProvider.GITHUB))
            .thenReturn(Optional.of(Integration.builder().accessToken(stored).build()));

        assertThat(tokens.token(3L)).isEqualTo(Optional.ofNullable(expected));
        assertThat(tokens.personal()).isFalse();
        assertThat(tokens.missingHint()).contains("Settings > Integrations");
        assertThat(tokens.refusedHint()).contains("Settings > Integrations");
        assertThat(tokens.accountLabel()).contains("workspace");
    }

    @Test
    @DisplayName("sans espace ou sans connexion, pas de jeton")
    void nothing_without_a_connection() {
        when(integrations.findByWorkspaceIdAndProvider(3L, IntegrationProvider.GITHUB)).thenReturn(Optional.empty());

        assertThat(tokens.token(3L)).isEmpty();
        assertThat(tokens.token(null)).isEmpty();
    }
}
