package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.dto.request.SlackChannelRequest;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.OAuthState;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.OAuthStateRepository;
import com.taskforce.tf_api.core.repository.SlackChannelRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;
import com.taskforce.tf_api.util.TransactionTemplateTestConfig;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests d'intégration de {@link SlackIntegrationService} sur un vrai Postgres, l'API Slack étant simulée
 * ({@code RestTemplate} mocké) : OAuth (succès, refus, échec), canaux, envoi des événements, déconnexion.
 */
@DisplayName("SlackIntegrationService (intégration Postgres)")
@Import({SlackIntegrationService.class, TransactionTemplateTestConfig.class})
class SlackIntegrationServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private SlackIntegrationService service;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private IntegrationRepository integrationRepository;
    @Autowired private OAuthStateRepository oauthStateRepository;
    @Autowired private SlackChannelRepository slackChannelRepository;
    @MockitoBean private RestTemplate restTemplate;
    // Collaborateurs Brain OS de sync() : non exercés ici, juste requis pour câbler le contexte.
    @MockitoBean private KnowledgeService knowledgeService;
    @MockitoBean private BrainSearchService brainSearch;

    private static final String SLUG = "ws-slack-it";
    private User owner;
    private Workspace workspace;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-slack").email("slack@it.dev").displayName("Owner").isActive(true).build());
        workspace = workspaceRepository.save(Workspace.builder().name("Slack WS").slug(SLUG).owner(owner).build());
    }

    /** Persiste un state OAuth valide (le callback résout le workspace via ce state). */
    private String pendingState() {
        return oauthStateRepository.save(OAuthState.builder()
            .state("st-" + UUID.randomUUID())
            .provider(IntegrationProvider.SLACK)
            .workspace(workspace)
            .user(owner)
            .expiresAt(LocalDateTime.now().plusMinutes(5))
            .build()).getState();
    }

    private void connectSlack() {
        integrationRepository.save(Integration.builder()
            .workspace(workspace)
            .provider(IntegrationProvider.SLACK)
            .accessToken("xoxb-token")
            .meta(Map.of())
            .build());
    }

    @SuppressWarnings("unchecked")
    private void slackAnswersPost(Map<String, Object> body) {
        Mockito.doReturn(ResponseEntity.ok(body))
            .when(restTemplate).exchange(ArgumentMatchers.anyString(), ArgumentMatchers.eq(HttpMethod.POST),
                ArgumentMatchers.any(), ArgumentMatchers.any(ParameterizedTypeReference.class));
    }

    @Test
    @DisplayName("buildAuthorizeUrl : state persisté et portées de lecture des canaux demandées")
    void should_build_authorize_url() {
        assertThat(service.buildAuthorizeUrl(SLUG, owner).toString())
            .contains("slack.com/oauth/v2/authorize")
            .contains("client_id=")
            .contains("state=")
            .contains("channels%3Ahistory")
            .contains("users%3Aread");
        assertThat(oauthStateRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("getStatus déconnecté ; disconnect sans connexion ne révoque rien")
    void should_report_disconnected() {
        assertThat(service.getStatus(SLUG).connected()).isFalse();
        service.disconnect(SLUG);
        assertThat(service.getChannels(SLUG)).isEmpty();
        Mockito.verifyNoInteractions(restTemplate);
    }

    @Test
    @DisplayName("getStatus = connecté après persistance d'une intégration Slack")
    void status_connected_when_integration_exists() {
        connectSlack();
        assertThat(service.getStatus(SLUG).connected()).isTrue();
    }

    @Test
    @DisplayName("addChannel persiste un canal puis getChannels le renvoie ; deleteChannel le retire")
    void add_list_and_delete_channel() {
        var res = service.addChannel(SLUG, new SlackChannelRequest("C0123456789", "general", List.of("issue.created")));
        assertThat(service.getChannels(SLUG)).singleElement().satisfies(c -> {
            assertThat(c.channelId()).isEqualTo("C0123456789");
            assertThat(c.eventTypes()).containsExactly("issue.created");
        });

        service.deleteChannel(SLUG, res.id());
        assertThat(service.getChannels(SLUG)).isEmpty();
    }

    @ParameterizedTest(name = "[{0}]")
    @ValueSource(strings = {"C1", "c0123456789", "C0123456789&limit=999", "C0123456789?x=1", ""})
    @DisplayName("addChannel refuse un identifiant de canal mal formé (il finit dans l'URL de l'API Slack)")
    void add_channel_refuses_bad_ids(String channelId) {
        assertThatThrownBy(() -> service.addChannel(SLUG, new SlackChannelRequest(channelId, "x", List.of())))
            .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("addChannel refuse un canal déjà configuré (chaque notification partirait deux fois)")
    void add_channel_refuses_duplicates() {
        service.addChannel(SLUG, new SlackChannelRequest("C0123456789", "general", List.of("issue.created")));

        assertThatThrownBy(() -> service.addChannel(SLUG, new SlackChannelRequest("C0123456789", "general", List.of())))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("already set up");
        assertThat(service.getChannels(SLUG)).hasSize(1);
    }

    @Test
    @DisplayName("addChannel refuse un événement inconnu")
    void add_channel_refuses_unknown_events() {
        assertThatThrownBy(() -> service.addChannel(SLUG,
                new SlackChannelRequest("C0123456789", "general", List.of("issue.created", "issue.exploded"))))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("issue.exploded");
    }

    @Test
    @DisplayName("handleCallback : jeton enregistré, et le canal choisi sur l'écran de Slack reçoit les notifications")
    void handle_callback_persists_integration_and_chosen_channel() {
        slackAnswersPost(Map.of(
            "ok", true,
            "access_token", "xoxb-123",
            "team", Map.of("id", "T42", "name", "Acme Corp"),
            "incoming_webhook", Map.of("channel", "#alerts", "channel_id", "C0ALERTS01")));

        String redirect = service.handleCallback("the-code", pendingState(), null);

        assertThat(redirect).contains("/" + SLUG + "/settings").contains("slack=connected");
        var status = service.getStatus(SLUG);
        assertThat(status.connected()).isTrue();
        assertThat(status.meta()).containsEntry("teamName", "Acme Corp").containsEntry("teamId", "T42");
        assertThat(service.getChannels(SLUG)).singleElement().satisfies(c -> {
            assertThat(c.channelId()).isEqualTo("C0ALERTS01");
            assertThat(c.channelName()).isEqualTo("alerts");
            assertThat(c.eventTypes()).containsExactly("issue.created");
        });
    }

    @Test
    @DisplayName("handleCallback : refus de Slack (ok=false) → retour dans l'app avec slack=error, rien d'enregistré")
    void handle_callback_redirects_when_slack_refuses() {
        slackAnswersPost(Map.of("ok", false, "error", "invalid_code"));

        String redirect = service.handleCallback("bad", pendingState(), null);

        assertThat(redirect).contains("/" + SLUG + "/settings").contains("slack=error");
        assertThat(service.getStatus(SLUG).connected()).isFalse();
    }

    @Test
    @DisplayName("handleCallback : accès refusé par l'utilisateur → slack=error sans appel à Slack ; state inconnu → racine")
    void handle_callback_access_denied_and_unknown_state() {
        String state = pendingState();

        assertThat(service.handleCallback(null, state, "access_denied")).contains("slack=error");
        assertThat(oauthStateRepository.findById(state)).isEmpty(); // usage unique, même en échec
        assertThat(service.handleCallback("code", "nope", null)).endsWith("/?slack=error");
        Mockito.verifyNoInteractions(restTemplate);
    }

    @Test
    @DisplayName("disconnect : connexion et canaux supprimés, jeton révoqué chez Slack")
    void disconnect_revokes_and_drops_channels() {
        connectSlack();
        service.addChannel(SLUG, new SlackChannelRequest("C0123456789", "general", List.of()));
        slackAnswersPost(Map.of("ok", true, "revoked", true));

        service.disconnect(SLUG);

        assertThat(service.getStatus(SLUG).connected()).isFalse();
        assertThat(slackChannelRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId())).isEmpty();
        Mockito.verify(restTemplate).exchange(ArgumentMatchers.eq("https://slack.com/api/auth.revoke"),
            ArgumentMatchers.eq(HttpMethod.POST), ArgumentMatchers.any(),
            ArgumentMatchers.any(ParameterizedTypeReference.class));
    }

    @Test
    @DisplayName("notifyEvent poste uniquement sur les canaux abonnés à l'événement")
    void notify_event_filters_by_type() {
        connectSlack();
        service.addChannel(SLUG, new SlackChannelRequest("C0CREATED1", "created-chan", List.of("issue.created")));
        service.addChannel(SLUG, new SlackChannelRequest("C0OTHER001", "other-chan", List.of("cycle.completed")));

        // dispatchEvent = logique sync sous-jacente de notifyEvent (@Async testé sans le proxy async)
        service.dispatchEvent(workspace.getId(), "issue.created", "New issue!");

        // Un seul POST : seul le canal abonné à issue.created reçoit
        Mockito.verify(restTemplate, Mockito.times(1)).postForObject(
            ArgumentMatchers.eq("https://slack.com/api/chat.postMessage"),
            ArgumentMatchers.any(),
            ArgumentMatchers.eq(Map.class));
    }
}
