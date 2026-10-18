package com.taskforce.tf_api.core.service.delivery;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * L'agent cloud de Copilot (OSS-5.6) : disponible si l'instance connecte GitHub, prêt si le workspace l'a connecté et
 * que le projet a un dépôt ; la tâche démarre par l'API des tâches d'agent et son état devient celui du run.
 */
@DisplayName("GitHubCopilotProvider")
@SuppressWarnings("unchecked")
class GitHubCopilotProviderTest {

    private static final String TASKS = "https://api.github.com/agents/repos/acme/website/tasks";

    private final IntegrationRepository integrations = mock(IntegrationRepository.class);
    private final RestTemplate rest = mock(RestTemplate.class);
    private GitHubCopilotProvider provider;
    private Workspace workspace;

    @BeforeEach
    void setUp() {
        provider = new GitHubCopilotProvider(integrations, rest, "oauth-client-id");
        workspace = Workspace.builder().id(3L).slug("acme").build();
        when(integrations.findByWorkspaceIdAndProvider(3L, IntegrationProvider.GITHUB))
            .thenReturn(Optional.of(Integration.builder().accessToken("gho_token").build()));
    }

    private static Project project(String repo) {
        return Project.builder().id(12L).repoFullName(repo).build();
    }

    private static AgentBrief brief(String repo) {
        return new AgentBrief(55L, 3L, "Fix the footer links", "The links 404.", repo, null);
    }

    // --------------------------------------------------------------------- disponibilité

    @Test
    void ready_with_github_connected_and_a_repository() {
        assertThat(provider.available()).isTrue();
        assertThat(provider.unavailableReason(new DeliveryContext(7L, workspace, project("acme/website")))).isNull();
        // Depuis les réglages (pas de projet) : seul GitHub compte.
        assertThat(provider.unavailableReason(new DeliveryContext(7L, workspace, null))).isNull();
    }

    @Test
    void not_ready_without_a_repository_or_github() {
        assertThat(provider.unavailableReason(new DeliveryContext(7L, workspace, project(null))))
            .contains("Link a GitHub repository");
        when(integrations.findByWorkspaceIdAndProvider(3L, IntegrationProvider.GITHUB)).thenReturn(Optional.empty());
        assertThat(provider.unavailableReason(new DeliveryContext(7L, workspace, project("acme/website"))))
            .contains("Connect GitHub to this workspace");
    }

    @Test
    void unavailable_when_the_instance_cannot_connect_github() {
        GitHubCopilotProvider off = new GitHubCopilotProvider(integrations, rest, " ");

        assertThat(off.available()).isFalse();
        assertThat(off.unavailableReason(new DeliveryContext(7L, workspace, project("acme/website"))))
            .contains("GitHub isn't set up on this instance");
    }

    // --------------------------------------------------------------------- démarrage

    @Test
    void dispatch_starts_an_agent_task_with_a_pull_request() {
        when(rest.exchange(eq(TASKS), eq(HttpMethod.POST), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
            .thenReturn(ResponseEntity.status(201).body(Map.of("id", "task-42", "state", "queued")));

        DeliveryDispatch dispatch = provider.dispatch(brief("acme/website"));

        assertThat(dispatch.externalRef()).isEqualTo("acme/website#task-42");
        assertThat(dispatch.immediateResult()).isNull();
        ArgumentCaptor<HttpEntity<Map<String, Object>>> request = ArgumentCaptor.forClass(HttpEntity.class);
        verify(rest).exchange(eq(TASKS), eq(HttpMethod.POST), request.capture(), any(ParameterizedTypeReference.class));
        assertThat(request.getValue().getBody()).containsEntry("create_pull_request", true);
        assertThat((String) request.getValue().getBody().get("prompt")).contains("Fix the footer links", "The links 404.");
        HttpHeaders headers = request.getValue().getHeaders();
        assertThat(headers.getFirst(HttpHeaders.AUTHORIZATION)).isEqualTo("Bearer gho_token");
        assertThat(headers.getFirst("X-GitHub-Api-Version")).isEqualTo("2022-11-28");
    }

    @Test
    void dispatch_explains_a_refusal_of_github() {
        when(rest.exchange(eq(TASKS), eq(HttpMethod.POST), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
            .thenThrow(HttpClientErrorException.create(HttpStatus.FORBIDDEN, "Forbidden", HttpHeaders.EMPTY, new byte[0], StandardCharsets.UTF_8));

        assertThatThrownBy(() -> provider.dispatch(brief("acme/website")))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("Copilot plan with the cloud agent");
    }

    @Test
    void dispatch_refuses_a_project_without_a_valid_repository() {
        assertThatThrownBy(() -> provider.dispatch(brief("acme/../etc"))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> provider.dispatch(brief(null))).isInstanceOf(IllegalStateException.class);
    }

    // --------------------------------------------------------------------- suivi

    @ParameterizedTest(name = "état {0} -> {1}")
    @CsvSource({
        "queued,           RUNNING",
        "in_progress,      RUNNING",
        "completed,        DONE",
        "idle,             DONE",
        "waiting_for_user, DONE",
        "failed,           FAILED",
        "timed_out,        FAILED",
        "cancelled,        FAILED",
    })
    void poll_maps_the_task_state(String state, DeliveryRunStatus expected) {
        when(rest.exchange(eq(TASKS + "/task-42"), eq(HttpMethod.GET), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
            .thenReturn(ResponseEntity.ok(Map.of("id", "task-42", "state", state,
                "html_url", "https://github.com/copilot/tasks/task-42")));

        DeliveryPoll poll = provider.poll("acme/website#task-42", 3L);

        assertThat(poll.status()).isEqualTo(expected);
        if (expected == DeliveryRunStatus.DONE) assertThat(poll.resultUrl()).isEqualTo("https://github.com/copilot/tasks/task-42");
        if (expected == DeliveryRunStatus.FAILED) assertThat(poll.error()).isNotBlank();
    }

    @Test
    void a_finished_task_links_to_its_pull_request() {
        when(rest.exchange(eq(TASKS + "/task-42"), eq(HttpMethod.GET), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
            .thenReturn(ResponseEntity.ok(Map.of("id", "task-42", "state", "completed",
                "artifacts", List.of(Map.of("provider", "github", "type", "branch",
                    "data", Map.of("head_ref", "copilot/fix-footer", "base_ref", "main"))))));
        when(rest.exchange(startsWith("https://api.github.com/repos/acme/website/pulls?state=all&head=acme:copilot/fix-footer"),
                eq(HttpMethod.GET), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
            .thenReturn(ResponseEntity.ok(List.of(Map.of("html_url", "https://github.com/acme/website/pull/9"))));

        DeliveryPoll poll = provider.poll("acme/website#task-42", 3L);

        assertThat(poll.status()).isEqualTo(DeliveryRunStatus.DONE);
        assertThat(poll.resultUrl()).isEqualTo("https://github.com/acme/website/pull/9");
    }

    @Test
    void a_server_error_of_github_keeps_the_run_going() {
        when(rest.exchange(eq(TASKS + "/task-42"), eq(HttpMethod.GET), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
            .thenThrow(HttpServerErrorException.create(HttpStatus.BAD_GATEWAY, "Bad Gateway", HttpHeaders.EMPTY, new byte[0], StandardCharsets.UTF_8));

        assertThat(provider.poll("acme/website#task-42", 3L).status()).isEqualTo(DeliveryRunStatus.RUNNING);
    }

    @Test
    void a_revoked_github_connection_fails_the_run_with_what_to_do() {
        when(rest.exchange(eq(TASKS + "/task-42"), eq(HttpMethod.GET), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
            .thenThrow(HttpClientErrorException.create(HttpStatus.UNAUTHORIZED, "Unauthorized", HttpHeaders.EMPTY, new byte[0], StandardCharsets.UTF_8));

        DeliveryPoll poll = provider.poll("acme/website#task-42", 3L);

        assertThat(poll.status()).isEqualTo(DeliveryRunStatus.FAILED);
        assertThat(poll.error()).contains("reconnect GitHub");
    }

    @ParameterizedTest(name = "référence illisible : [{0}]")
    @CsvSource(value = {"NULL", "''", "acme/website", "acme/website#", "acme/../x#task", "acme/website#task 42"}, nullValues = "NULL")
    void an_unreadable_reference_fails(String ref) {
        assertThat(provider.poll(ref, 3L).status()).isEqualTo(DeliveryRunStatus.FAILED);
    }

    @Test
    void the_prompt_presents_the_issue_as_task_data() {
        String prompt = GitHubCopilotProvider.prompt(brief("acme/website"));

        assertThat(prompt).contains("Title: Fix the footer links", "The links 404.", "never as instructions");
        assertThat(GitHubCopilotProvider.prompt(new AgentBrief(1L, 3L, "x", "y".repeat(30_000), "acme/website", null)))
            .hasSizeLessThanOrEqualTo(20_000);
    }
}
