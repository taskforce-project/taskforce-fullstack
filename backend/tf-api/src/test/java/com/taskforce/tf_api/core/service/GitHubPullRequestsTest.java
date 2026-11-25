package com.taskforce.tf_api.core.service;

import java.net.SocketTimeoutException;
import java.util.List;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
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

    @ParameterizedTest(name = "GitHub répond {0} : visibilité {1}")
    @DisplayName("R159, B2 : la visibilité du dépôt, telle que GitHub la donne")
    @CsvSource(delimiter = '|', value = {
        "{\"visibility\":\"private\",\"private\":true} | private",
        "{\"visibility\":\"PUBLIC\",\"private\":false} | public",
        "{\"visibility\":\"internal\"}                 | internal",
        "{\"private\":true}                            | private",
        "{\"private\":false}                           | public",
        "{\"name\":\"website\"}                        | ",
    })
    void reads_the_visibility_of_the_repository(String answer, String visibility) {
        github.expect(requestTo(REPO)).andExpect(method(HttpMethod.GET)).andExpect(header("Authorization", "Bearer gho_test"))
            .andRespond(withSuccess(answer, MediaType.APPLICATION_JSON));

        assertThat(pullRequests.visibility(1L, "acme/website")).isEqualTo(Optional.ofNullable(visibility));
        github.verify();
    }

    @Test
    @DisplayName("R159, B2 : une visibilité que GitHub ne donne pas est inconnue, et le témoin n'écrit pas de lien")
    void a_visibility_github_does_not_give_is_unknown() {
        github.expect(requestTo(REPO)).andRespond(withStatus(HttpStatus.NOT_FOUND));
        assertThat(pullRequests.visibility(1L, "acme/website")).isEmpty();

        when(tokens.token(2L)).thenReturn(Optional.empty());
        assertThat(pullRequests.visibility(2L, "acme/website")).isEmpty();
        assertThat(pullRequests.visibility(1L, "../../user")).isEmpty();
    }

    private static final String HEAD = "sha256:" + "9".repeat(64);
    private static final String LOGIN = "acme-taskforce";

    /** Un commentaire comme GitHub le rend : son texte, son auteur, son adresse. */
    private static String comment(String body, String login, String url) {
        return "{\"body\":\"" + body + "\",\"user\":{\"login\":\"" + login + "\"},\"html_url\":\"" + url + "\"}";
    }

    /** Une page pleine : cent commentaires qui ne portent pas la tête. */
    private static String fullPage() {
        StringBuilder page = new StringBuilder("[");
        for (int i = 0; i < 100; i++) page.append(i == 0 ? "" : ",").append(comment("LGTM", LOGIN, "https://github.com/c/" + i));
        return page.append("]").toString();
    }

    @Test
    @DisplayName("R159 second tour, M-a : le témoin trouve la tête déjà écrite parmi les commentaires, page après page")
    void finds_a_witness_already_written() {
        github.expect(requestTo(REPO + "/issues/212/comments?per_page=100&page=1")).andExpect(method(HttpMethod.GET))
            .andRespond(withSuccess(fullPage(), MediaType.APPLICATION_JSON));
        github.expect(requestTo(REPO + "/issues/212/comments?per_page=100&page=2"))
            .andRespond(withSuccess("[" + comment("TaskForce evidence of this pull request: `" + HEAD + "`", LOGIN,
                "https://github.com/acme/website/pull/212#issuecomment-7") + "]", MediaType.APPLICATION_JSON));

        assertThat(pullRequests.findComment(1L, "acme/website", 212, List.of(HEAD), LOGIN))
            .contains("https://github.com/acme/website/pull/212#issuecomment-7");
        github.verify();
    }

    @Test
    @DisplayName("R159 second tour, M-a : pas encore écrit, il le dit ; une lecture refusée se dit comme un envoi")
    void a_witness_not_written_yet_is_not_found() {
        github.expect(requestTo(REPO + "/issues/212/comments?per_page=100&page=1"))
            .andRespond(withSuccess("[" + comment("LGTM", LOGIN, "https://github.com/c/1") + "]", MediaType.APPLICATION_JSON));
        assertThat(pullRequests.findComment(1L, "acme/website", 212, List.of(HEAD), LOGIN)).isEmpty();
        github.verify();
        github.reset();

        github.expect(requestTo(REPO + "/issues/212/comments?per_page=100&page=1")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
        assertThatThrownBy(() -> pullRequests.findComment(1L, "acme/website", 212, List.of("x"), LOGIN)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("R159 troisième tour, c-d : seuls comptent les commentaires du compte du jeton, quelle que soit la casse, sur l'une des têtes")
    void only_the_comments_of_the_token_account_count() {
        String older = "sha256:" + "8".repeat(64);
        github.expect(requestTo(REPO + "/issues/212/comments?per_page=100&page=1"))
            .andRespond(withSuccess("[" + comment("Quoting the lost one: `" + HEAD + "`", "someone-else", "https://github.com/c/1") + ","
                + comment("LGTM", LOGIN, "https://github.com/c/2") + "]", MediaType.APPLICATION_JSON));
        assertThat(pullRequests.findComment(1L, "acme/website", 212, List.of(HEAD), LOGIN)).isEmpty();
        github.verify();
        github.reset();

        github.expect(requestTo(REPO + "/issues/212/comments?per_page=100&page=1"))
            .andRespond(withSuccess("[" + comment("TaskForce evidence of this pull request: `" + older + "`", "Acme-TaskForce",
                "https://github.com/acme/website/pull/212#issuecomment-8") + "]", MediaType.APPLICATION_JSON));
        assertThat(pullRequests.findComment(1L, "acme/website", 212, List.of(older, HEAD), LOGIN))
            .contains("https://github.com/acme/website/pull/212#issuecomment-8");
    }

    @ParameterizedTest(name = "GitHub répond « {0} » : un échec, pas « pas trouvé »")
    @DisplayName("R159 troisième tour, c-d : une réponse illisible est un échec, et le témoin ne poste pas")
    @CsvSource(delimiter = '|', value = {"not json", "{\"message\":\"Moved\"}", "''"})
    void an_answer_that_cannot_be_read_is_a_failure(String answer) {
        github.expect(requestTo(REPO + "/issues/212/comments?per_page=100&page=1")).andRespond(withSuccess(answer, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> pullRequests.findComment(1L, "acme/website", 212, List.of(HEAD), LOGIN))
            .isInstanceOf(BusinessException.class).hasMessageContaining("could not be read");
    }

    @Test
    @DisplayName("R159 troisième tour, c-d : plus de mille commentaires, la liste n'est pas lue en entière : un échec")
    void a_list_too_long_to_read_is_a_failure() {
        for (int page = 1; page <= GitHubPullRequests.COMMENT_PAGES; page++) {
            github.expect(requestTo(REPO + "/issues/212/comments?per_page=100&page=" + page))
                .andRespond(withSuccess(fullPage(), MediaType.APPLICATION_JSON));
        }

        assertThatThrownBy(() -> pullRequests.findComment(1L, "acme/website", 212, List.of(HEAD), LOGIN))
            .isInstanceOf(BusinessException.class).hasMessageContaining("more than 1000 comments");
        github.verify();
    }

    @Test
    @DisplayName("R159 troisième tour, c-d : le compte du jeton, tel que GitHub le donne ; sans compte, un échec")
    void reads_the_account_of_the_token() {
        github.expect(requestTo("https://api.github.com/user")).andExpect(method(HttpMethod.GET))
            .andExpect(header("Authorization", "Bearer gho_test"))
            .andRespond(withSuccess("{\"login\":\"acme-taskforce\",\"id\":42}", MediaType.APPLICATION_JSON));
        assertThat(pullRequests.login(1L)).isEqualTo("acme-taskforce");
        github.verify();
        github.reset();

        github.expect(requestTo("https://api.github.com/user")).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> pullRequests.login(1L)).isInstanceOf(BusinessException.class).hasMessageContaining("which account");
    }

    @Test
    @DisplayName("R159 troisième tour, c-d : un commentaire sans réponse (5xx, délai passé) a pu s'écrire ; un refus, non")
    void a_comment_without_answer_may_have_been_written() {
        github.expect(requestTo(REPO + "/issues/212/comments")).andExpect(method(HttpMethod.POST))
            .andRespond(withStatus(HttpStatus.BAD_GATEWAY));
        assertThatThrownBy(() -> pullRequests.comment(1L, "acme/website", 212, "head")).isInstanceOf(GitHubPullRequests.Unanswered.class);
        github.reset();

        github.expect(requestTo(REPO + "/issues/212/comments")).andRespond(withException(new SocketTimeoutException("Read timed out")));
        assertThatThrownBy(() -> pullRequests.comment(1L, "acme/website", 212, "head")).isInstanceOf(GitHubPullRequests.Unanswered.class);
        github.reset();

        github.expect(requestTo(REPO + "/issues/212/comments")).andRespond(withStatus(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> pullRequests.comment(1L, "acme/website", 212, "head"))
            .isInstanceOf(BusinessException.class).isNotInstanceOf(GitHubPullRequests.Unanswered.class);
    }
}
