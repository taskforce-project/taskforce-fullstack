package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests d'intégration — {@link SlackIntegrationService} (parties sans appel API réel).
 * URL OAuth, statut déconnecté, disconnect, listing des canaux (vide).
 */
@DisplayName("SlackIntegrationService (intégration Postgres)")
@Import(SlackIntegrationService.class)
class SlackIntegrationServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private SlackIntegrationService service;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;

    @Autowired private com.taskforce.tf_api.core.repository.IntegrationRepository integrationRepository;
    @MockitoBean private RestTemplate restTemplate;

    private static final String SLUG = "ws-slack-it";

    @BeforeEach
    void seed() {
        User owner = userRepository.save(User.builder()
            .keycloakId("kc-slack").email("slack@it.dev").displayName("Owner").isActive(true).build());
        workspaceRepository.save(Workspace.builder().name("Slack WS").slug(SLUG).owner(owner).build());
    }

    @Test
    @DisplayName("buildAuthorizeUrl construit une URL OAuth avec le state = slug")
    void should_build_authorize_url() {
        assertThat(service.buildAuthorizeUrl(SLUG).toString()).contains("state=" + SLUG);
    }

    @Test
    @DisplayName("getStatus déconnecté + disconnect idempotent + getChannels vide")
    void should_report_disconnected() {
        assertThat(service.getStatus(SLUG).connected()).isFalse();
        service.disconnect(SLUG);
        assertThat(service.getChannels(SLUG)).isEmpty();
    }

    private void connectSlack() {
        var ws = workspaceRepository.findBySlug(SLUG).orElseThrow();
        integrationRepository.save(com.taskforce.tf_api.core.model.Integration.builder()
            .workspace(ws)
            .provider(com.taskforce.tf_api.core.enums.IntegrationProvider.SLACK)
            .accessToken("xoxb-token")
            .meta(java.util.Map.of())
            .build());
    }

    @Test
    @DisplayName("getStatus = connecté après persistance d'une intégration Slack")
    void status_connected_when_integration_exists() {
        connectSlack();
        assertThat(service.getStatus(SLUG).connected()).isTrue();
    }

    @Test
    @DisplayName("addChannel persiste un canal puis getChannels le renvoie")
    void add_and_list_channel() {
        var res = service.addChannel(SLUG,
            new com.taskforce.tf_api.core.dto.request.SlackChannelRequest("C123", "general", java.util.List.of("issue.created")));
        assertThat(res).isNotNull();
        assertThat(service.getChannels(SLUG)).hasSize(1);
    }

    @Test
    @DisplayName("deleteChannel retire le canal ajouté")
    void delete_channel() {
        var res = service.addChannel(SLUG,
            new com.taskforce.tf_api.core.dto.request.SlackChannelRequest("C999", "random", java.util.List.of()));
        service.deleteChannel(SLUG, res.id());
        assertThat(service.getChannels(SLUG)).isEmpty();
    }

    @Test
    @DisplayName("sendNotification sans intégration Slack ne lève rien (no-op)")
    void send_notification_noop_without_integration() {
        var ws = workspaceRepository.findBySlug(SLUG).orElseThrow();
        // Aucune intégration persistée → la branche ifPresent ne s'exécute pas
        service.sendNotification(ws.getId(), "hello");
    }
}
