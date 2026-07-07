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
    @Autowired private com.taskforce.tf_api.core.repository.OAuthStateRepository oauthStateRepository;
    @MockitoBean private RestTemplate restTemplate;

    private static final String SLUG = "ws-slack-it";
    private User owner;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-slack").email("slack@it.dev").displayName("Owner").isActive(true).build());
        workspaceRepository.save(Workspace.builder().name("Slack WS").slug(SLUG).owner(owner).build());
    }

    @Test
    @DisplayName("buildAuthorizeUrl construit une URL OAuth avec un state aléatoire persisté")
    void should_build_authorize_url() {
        assertThat(service.buildAuthorizeUrl(SLUG, owner).toString())
            .contains("slack.com/oauth/v2/authorize")
            .contains("client_id=")
            .contains("state=");
        assertThat(oauthStateRepository.count()).isEqualTo(1);
    }

    /** Persiste un state OAuth valide (le callback résout le workspace via ce state). */
    private String pendingState() {
        var ws = workspaceRepository.findBySlug(SLUG).orElseThrow();
        return oauthStateRepository.save(com.taskforce.tf_api.core.model.OAuthState.builder()
            .state("st-" + java.util.UUID.randomUUID())
            .provider(com.taskforce.tf_api.core.enums.IntegrationProvider.SLACK)
            .workspace(ws)
            .user(owner)
            .expiresAt(java.time.LocalDateTime.now().plusMinutes(5))
            .build()).getState();
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

    @Test
    @DisplayName("handleCallback échange le code, extrait team.id/team.name et persiste l'intégration Slack")
    void handle_callback_persists_integration() {
        org.mockito.Mockito.doReturn(org.springframework.http.ResponseEntity.ok(java.util.Map.of(
                "ok", true,
                "access_token", "xoxb-123",
                "team", java.util.Map.of("id", "T42", "name", "Acme Corp"))))
            .when(restTemplate).exchange(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.eq(org.springframework.http.HttpMethod.POST),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(org.springframework.core.ParameterizedTypeReference.class));

        String redirect = service.handleCallback("the-code", pendingState());

        assertThat(redirect).contains("/" + SLUG + "/settings").contains("slack=connected");
        var status = service.getStatus(SLUG);
        assertThat(status.connected()).isTrue();
        assertThat(status.meta()).containsEntry("teamName", "Acme Corp").containsEntry("teamId", "T42");
    }

    @Test
    @DisplayName("handleCallback lève une erreur si la réponse Slack a ok=false")
    void handle_callback_fails_when_not_ok() {
        org.mockito.Mockito.doReturn(org.springframework.http.ResponseEntity.ok(java.util.Map.of(
                "ok", false, "error", "invalid_code")))
            .when(restTemplate).exchange(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.eq(org.springframework.http.HttpMethod.POST),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(org.springframework.core.ParameterizedTypeReference.class));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.handleCallback("bad", pendingState()))
            .isInstanceOf(RuntimeException.class);
    }

    @Test
    @DisplayName("sendNotification poste sur le 1er canal actif via l'API Slack chat.postMessage")
    void send_notification_posts_to_active_channel() {
        connectSlack();
        service.addChannel(SLUG,
            new com.taskforce.tf_api.core.dto.request.SlackChannelRequest("C777", "alertes", java.util.List.of()));
        var ws = workspaceRepository.findBySlug(SLUG).orElseThrow();

        service.sendNotification(ws.getId(), "Nouvelle issue !");

        org.mockito.Mockito.verify(restTemplate).postForObject(
            org.mockito.ArgumentMatchers.eq("https://slack.com/api/chat.postMessage"),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq(java.util.Map.class));
    }

    @Test
    @DisplayName("sendNotification avec intégration mais sans canal actif ne poste rien")
    void send_notification_no_channel_no_post() {
        connectSlack(); // intégration présente, aucun canal
        var ws = workspaceRepository.findBySlug(SLUG).orElseThrow();

        service.sendNotification(ws.getId(), "silence");

        org.mockito.Mockito.verifyNoInteractions(restTemplate);
    }

    @Test
    @DisplayName("notifyEvent poste uniquement sur les canaux abonnés à l'événement")
    void notify_event_filters_by_type() {
        connectSlack();
        service.addChannel(SLUG, new com.taskforce.tf_api.core.dto.request.SlackChannelRequest(
            "C-created", "created-chan", java.util.List.of("issue.created")));
        service.addChannel(SLUG, new com.taskforce.tf_api.core.dto.request.SlackChannelRequest(
            "C-other", "other-chan", java.util.List.of("cycle.completed")));
        var ws = workspaceRepository.findBySlug(SLUG).orElseThrow();

        // dispatchEvent = logique sync sous-jacente de notifyEvent (@Async testé sans le proxy async)
        service.dispatchEvent(ws.getId(), "issue.created", "Nouvelle issue !");

        // Un seul POST : seul le canal abonné à issue.created reçoit
        org.mockito.Mockito.verify(restTemplate, org.mockito.Mockito.times(1)).postForObject(
            org.mockito.ArgumentMatchers.eq("https://slack.com/api/chat.postMessage"),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq(java.util.Map.class));
    }
}
