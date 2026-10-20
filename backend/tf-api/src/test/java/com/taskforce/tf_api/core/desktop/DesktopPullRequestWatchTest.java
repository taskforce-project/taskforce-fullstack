package com.taskforce.tf_api.core.desktop;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.taskforce.tf_api.core.service.GitHubIntegrationService;

/** App desktop : relecture périodique des pull requests liées, que GitHub ne peut pas lui annoncer. */
@DisplayName("DesktopPullRequestWatch")
class DesktopPullRequestWatchTest {

    private final GitHubIntegrationService github = mock(GitHubIntegrationService.class);
    private final DesktopPullRequestWatch watch = new DesktopPullRequestWatch(github);

    @ParameterizedTest(name = "{0} ticket(s) terminé(s)")
    @ValueSource(ints = {0, 2})
    @DisplayName("relit au plus dix pull requests par passage")
    void refreshes_a_bounded_batch(int completed) {
        when(github.refreshOpenPullRequests(DesktopPullRequestWatch.BUDGET)).thenReturn(completed);

        watch.refresh();

        verify(github).refreshOpenPullRequests(10);
    }

    @Test
    @DisplayName("un échec n'arrête jamais la relecture suivante")
    void a_failure_never_escapes() {
        when(github.refreshOpenPullRequests(DesktopPullRequestWatch.BUDGET)).thenThrow(new IllegalStateException("db down"));

        assertThatCode(watch::refresh).doesNotThrowAnyException();
    }
}
