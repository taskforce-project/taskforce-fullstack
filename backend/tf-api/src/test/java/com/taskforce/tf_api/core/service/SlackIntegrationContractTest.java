package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.OAuthState;
import com.taskforce.tf_api.core.model.SlackChannel;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.OAuthStateRepository;
import com.taskforce.tf_api.core.repository.SlackChannelRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Contract test (wire) — {@link SlackIntegrationService} contre l'API Slack (OAuth + chat.postMessage).
 *
 * <p>{@link MockRestServiceServer} lié au {@code RestTemplate} injecté : valide les <b>vraies requêtes HTTP</b>
 * (POST {@code /api/oauth.v2.access} form-urlencoded, POST {@code /api/chat.postMessage} avec header
 * {@code Authorization: Bearer <token>} et corps JSON {@code {channel, text}}). Repos mockés (Mockito).</p>
 */
@DisplayName("SlackIntegrationService (contract wire API Slack)")
class SlackIntegrationContractTest {

    private static final String SLUG = "acme";
    private static final Long WORKSPACE_ID = 1L;

    private SlackIntegrationService service;
    private MockRestServiceServer server;

    private IntegrationRepository integrationRepository;
    private SlackChannelRepository slackChannelRepository;
    private WorkspaceRepository workspaceRepository;
    private OAuthStateRepository oauthStateRepository;

    private Workspace workspace;

    @BeforeEach
    void setUp() {
        integrationRepository  = Mockito.mock(IntegrationRepository.class);
        slackChannelRepository = Mockito.mock(SlackChannelRepository.class);
        workspaceRepository    = Mockito.mock(WorkspaceRepository.class);
        oauthStateRepository   = Mockito.mock(OAuthStateRepository.class);
        RestTemplate rt = new RestTemplate();

        // Ordre du constructeur @RequiredArgsConstructor = ordre de déclaration des champs final :
        // integrationRepository, slackChannelRepository, workspaceRepository, oauthStateRepository, restTemplate
        service = new SlackIntegrationService(
            integrationRepository,
            slackChannelRepository,
            workspaceRepository,
            oauthStateRepository,
            rt
        );

        ReflectionTestUtils.setField(service, "clientId", "cid");
        ReflectionTestUtils.setField(service, "clientSecret", "secret");
        ReflectionTestUtils.setField(service, "frontendUrl", "http://localhost:3000");
        ReflectionTestUtils.setField(service, "appUrl", "http://localhost:8080");

        workspace = Workspace.builder().id(WORKSPACE_ID).name("Acme").slug(SLUG).build();

        server = MockRestServiceServer.createServer(rt);
    }

    @Test
    @DisplayName("handleCallback : POST oauth.v2.access (form-urlencoded), ok=true → redirect slack=connected")
    void handleCallback_echange_le_code_ok() {
        stubState("the-state");
        Mockito.when(integrationRepository.findByWorkspaceIdAndProvider(WORKSPACE_ID, IntegrationProvider.SLACK))
            .thenReturn(Optional.empty());

        server.expect(requestTo("https://slack.com/api/oauth.v2.access"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED))
            .andRespond(withSuccess(
                "{\"ok\":true,\"access_token\":\"xoxb\",\"team\":{\"id\":\"T1\",\"name\":\"Acme\"}}",
                MediaType.APPLICATION_JSON));

        String redirect = service.handleCallback("the-code", "the-state");

        assertThat(redirect).contains("slack=connected");
        server.verify();
    }

    @Test
    @DisplayName("handleCallback : ok=false → RuntimeException")
    void handleCallback_ok_false_leve_exception() {
        stubState("the-state");
        server.expect(requestTo("https://slack.com/api/oauth.v2.access"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withSuccess("{\"ok\":false,\"error\":\"bad\"}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> service.handleCallback("the-code", "the-state"))
            .isInstanceOf(RuntimeException.class);
        server.verify();
    }

    /** Stub d'un state OAuth valide (workspace résolu via le state, pas via le slug). */
    private void stubState(String state) {
        OAuthState s = OAuthState.builder()
            .state(state).provider(IntegrationProvider.SLACK)
            .workspace(workspace).expiresAt(java.time.LocalDateTime.now().plusMinutes(5)).build();
        Mockito.when(oauthStateRepository.findById(state)).thenReturn(Optional.of(s));
    }

    @Test
    @DisplayName("sendNotification : POST chat.postMessage (Bearer) avec corps JSON {channel, text}")
    void sendNotification_poste_le_bon_wire() {
        Integration integration = Integration.builder()
            .workspace(workspace)
            .provider(IntegrationProvider.SLACK)
            .accessToken("xoxb-token")
            .meta(Map.of())
            .build();
        Mockito.when(integrationRepository.findByWorkspaceIdAndProvider(WORKSPACE_ID, IntegrationProvider.SLACK))
            .thenReturn(Optional.of(integration));

        SlackChannel channel = SlackChannel.builder()
            .workspace(workspace)
            .channelId("C123")
            .channelName("general")
            .active(true)
            .build();
        Mockito.when(slackChannelRepository.findByWorkspaceIdOrderByCreatedAtDesc(WORKSPACE_ID))
            .thenReturn(List.of(channel));

        server.expect(requestTo("https://slack.com/api/chat.postMessage"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("Authorization", "Bearer xoxb-token"))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.channel").value("C123"))
            .andExpect(jsonPath("$.text").value("Nouvelle notification"))
            .andRespond(withSuccess("{\"ok\":true}", MediaType.APPLICATION_JSON));

        service.sendNotification(WORKSPACE_ID, "Nouvelle notification");

        server.verify();
    }

    @Test
    @DisplayName("fetchHistory : GET conversations.history (Bearer) → messages en ordre chrono, sous-types ignorés")
    void fetchHistory_maps_and_orders() {
        Integration integration = Integration.builder()
            .workspace(workspace).provider(IntegrationProvider.SLACK).accessToken("xoxb-token").meta(Map.of()).build();
        Mockito.when(integrationRepository.findByWorkspaceIdAndProvider(WORKSPACE_ID, IntegrationProvider.SLACK))
            .thenReturn(Optional.of(integration));

        server.expect(requestTo(org.hamcrest.Matchers.containsString("conversations.history?channel=C1")))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("Authorization", "Bearer xoxb-token"))
            .andRespond(withSuccess("{\"ok\":true,\"messages\":["
                + "{\"ts\":\"200\",\"user\":\"U2\",\"text\":\"second\"},"
                + "{\"subtype\":\"channel_join\",\"ts\":\"150\",\"text\":\"joined\"},"
                + "{\"ts\":\"100\",\"user\":\"U1\",\"text\":\"first\"}]}", MediaType.APPLICATION_JSON));

        var msgs = service.fetchHistory(WORKSPACE_ID, "C1", null);

        assertThat(msgs).hasSize(2);                       // le channel_join (subtype) est ignoré
        assertThat(msgs.get(0).text()).isEqualTo("first");  // remis en ordre chronologique (ts 100 avant 200)
        assertThat(msgs.get(1).text()).isEqualTo("second");
        server.verify();
    }

    @Test
    @DisplayName("resolveUserName : GET users.info → display_name")
    void resolveUserName_maps() {
        Integration integration = Integration.builder()
            .workspace(workspace).provider(IntegrationProvider.SLACK).accessToken("xoxb-token").meta(Map.of()).build();
        Mockito.when(integrationRepository.findByWorkspaceIdAndProvider(WORKSPACE_ID, IntegrationProvider.SLACK))
            .thenReturn(Optional.of(integration));

        server.expect(requestTo(org.hamcrest.Matchers.containsString("users.info?user=U1")))
            .andExpect(method(HttpMethod.GET))
            .andRespond(withSuccess(
                "{\"ok\":true,\"user\":{\"real_name\":\"Alice R\",\"profile\":{\"display_name\":\"alice\"}}}",
                MediaType.APPLICATION_JSON));

        assertThat(service.resolveUserName(WORKSPACE_ID, "U1")).isEqualTo("alice");
        server.verify();
    }
}
