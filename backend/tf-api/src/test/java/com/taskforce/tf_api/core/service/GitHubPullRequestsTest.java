package com.taskforce.tf_api.core.service;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withNoContent;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** Les gestes de la carte de résultat sur GitHub (R78) : fusionner, fermer, supprimer la branche, et ce qu'on dit d'un refus. */
@DisplayName("GitHub : fusionner, fermer, supprimer la branche")
class GitHubPullRequestsTest {

    private static final String REPO = "https://api.github.com/repos/acme/website";

    private final GitHubTokenSource tokens = mock(GitHubTokenSource.class);
    private MockRestServiceServer github;
    private GitHubPullRequests pullRequests;

    @BeforeEach
    void setUp() {
        RestTemplate http = new RestTemplate();
        github = MockRestServiceServer.bindTo(http).build();
        pullRequests = new GitHubPullRequests(tokens, http);
        when(tokens.token(1L)).thenReturn(Optional.of("gho_test"));
        when(tokens.missingHint()).thenReturn("Connect GitHub to TaskForce first.");
        when(tokens.refusedHint()).thenReturn("GitHub refused this account.");
    }

    @Test
    void merges_the_pull_request_with_the_token_of_the_source() {
        github.expect(requestTo(REPO + "/pulls/212/merge")).andExpect(method(HttpMethod.PUT))
            .andExpect(header("Authorization", "Bearer gho_test"))
            .andRespond(withSuccess("{\"merged\":true}", MediaType.APPLICATION_JSON));

        pullRequests.merge(1L, "acme/website", 212);

        github.verify();
    }

    @Test
    void closes_the_pull_request_without_merging_it() {
        github.expect(requestTo(REPO + "/pulls/212")).andExpect(method(HttpMethod.PATCH))
            .andExpect(content().json("{\"state\":\"closed\"}"))
            .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        pullRequests.close(1L, "acme/website", 212);

        github.verify();
    }

    @Test
    void deletes_the_agent_s_branch() {
        github.expect(requestTo(REPO + "/git/refs/heads/tf/web-28")).andExpect(method(HttpMethod.DELETE)).andRespond(withNoContent());

        pullRequests.deleteBranch(1L, "acme/website", "tf/web-28");

        github.verify();
    }

    @Test
    @DisplayName("une branche qui ne se supprime pas ne fait pas échouer le geste : la PR fermée suffit")
    void a_branch_that_stays_does_not_fail_the_gesture() {
        github.expect(requestTo(REPO + "/git/refs/heads/tf/web-28")).andRespond(withStatus(HttpStatus.valueOf(422)));

        assertThatCode(() -> pullRequests.deleteBranch(1L, "acme/website", "tf/web-28")).doesNotThrowAnyException();
    }

    @ParameterizedTest(name = "GitHub répond {0} : « {1} »")
    @CsvSource(delimiter = '|', value = {
        "405 | may have conflicts",
        "409 | may have conflicts",
        "403 | GitHub refused this account.",
        "404 | GitHub refused this account.",
        "500 | HTTP 500",
    })
    void says_why_github_refused(int status, String message) {
        github.expect(requestTo(REPO + "/pulls/212/merge")).andRespond(withStatus(HttpStatus.valueOf(status)));

        assertThatThrownBy(() -> pullRequests.merge(1L, "acme/website", 212))
            .isInstanceOf(BusinessException.class).hasMessageContaining(message);
    }

    @Test
    void without_a_token_it_says_how_to_connect_github() {
        when(tokens.token(2L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> pullRequests.merge(2L, "acme/website", 212))
            .isInstanceOf(BusinessException.class).hasMessage("Connect GitHub to TaskForce first.");
    }

    @Test
    void only_a_github_repository_name() {
        assertThatThrownBy(() -> pullRequests.close(1L, "../../user", 1))
            .isInstanceOf(BusinessException.class).hasMessageContaining("not a GitHub repository");
    }
}
