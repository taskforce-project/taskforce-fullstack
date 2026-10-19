package com.taskforce.tf_api.core.service.webhook;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.WebhookEventType;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Webhook;
import com.taskforce.tf_api.core.model.WebhookDelivery;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WebhookDeliveryRepository;
import com.taskforce.tf_api.core.repository.WebhookRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Tests unitaires de {@link WebhookOutbox} : qui reçoit un événement, et ce qu'il reçoit. */
@ExtendWith(MockitoExtension.class)
@DisplayName("WebhookOutbox")
class WebhookOutboxTest {

    @Mock private WebhookRepository webhookRepository;
    @Mock private WebhookDeliveryRepository deliveryRepository;
    @Mock private UserRepository userRepository;

    private final ObjectMapper json = new ObjectMapper();
    private WebhookOutbox outbox;
    private final Workspace workspace = Workspace.builder().id(1L).slug("acme").name("Acme").build();

    @BeforeEach
    void setUp() {
        outbox = new WebhookOutbox(webhookRepository, deliveryRepository, userRepository, json);
        ReflectionTestUtils.setField(outbox, "appUrl", "https://app.example.com/");
    }

    private Webhook webhook(long id, String secret, String... events) {
        return Webhook.builder().id(id).workspace(workspace).url("https://hooks.example.com/" + id)
            .secret(secret).eventTypes(events).active(true).build();
    }

    private WorkspaceWebhookEvent issueCreated() {
        return new WorkspaceWebhookEvent(1L, WebhookEventType.ISSUE_CREATED, 7L,
            Map.of("issue", Map.of("id", 42, "title", "Fix login")), "/acme/projects/3/issues/42");
    }

    @Test
    @DisplayName("un envoi par webhook abonné (ou abonné à tout), le même corps pour chacun")
    void one_delivery_per_subscribed_webhook() throws Exception {
        when(webhookRepository.findByWorkspaceIdAndActiveTrue(1L)).thenReturn(List.of(
            webhook(1, "s1", "issue.created"), webhook(2, "s2"), webhook(3, "s3", "comment.created")));
        when(userRepository.findById(7L)).thenReturn(Optional.of(User.builder().id(7L).displayName("Pierre").build()));

        outbox.onEvent(issueCreated());

        ArgumentCaptor<WebhookDelivery> captor = ArgumentCaptor.forClass(WebhookDelivery.class);
        verify(deliveryRepository, times(2)).save(captor.capture());
        List<WebhookDelivery> saved = captor.getAllValues();
        assertThat(saved).extracting(d -> d.getWebhook().getId()).containsExactly(1L, 2L);
        assertThat(saved.get(0).getPayload()).isEqualTo(saved.get(1).getPayload());
        assertThat(saved.get(0).getDeliveryId()).isNotEqualTo(saved.get(1).getDeliveryId());
        assertThat(saved).allSatisfy(d -> {
            assertThat(d.getEventType()).isEqualTo("issue.created");
            assertThat(d.getNextAttemptAt()).isBeforeOrEqualTo(LocalDateTime.now());
        });

        JsonNode body = json.readTree(saved.get(0).getPayload());
        assertThat(body.path("id").asText()).startsWith("evt_");
        assertThat(body.path("type").asText()).isEqualTo("issue.created");
        assertThat(body.path("url").asText()).isEqualTo("https://app.example.com/acme/projects/3/issues/42");
        assertThat(body.path("workspace").path("slug").asText()).isEqualTo("acme");
        assertThat(body.path("actor").path("name").asText()).isEqualTo("Pierre");
        assertThat(body.path("data").path("issue").path("title").asText()).isEqualTo("Fix login");
        assertThat(body.path("createdAt").asText()).endsWith("Z");
    }

    @Test
    @DisplayName("aucun webhook abonné → rien d'écrit")
    void nothing_without_subscribers() {
        when(webhookRepository.findByWorkspaceIdAndActiveTrue(1L)).thenReturn(List.of(webhook(1, "s1", "comment.created")));

        outbox.onEvent(issueCreated());

        verify(deliveryRepository, never()).save(any());
    }

    @Test
    @DisplayName("un webhook créé avant la signature reçoit un secret à son premier envoi")
    void legacy_webhook_gets_a_secret() {
        Webhook legacy = webhook(1, null);
        when(webhookRepository.findByWorkspaceIdAndActiveTrue(1L)).thenReturn(List.of(legacy));

        outbox.onEvent(issueCreated());

        assertThat(legacy.getSecret()).startsWith("whsec_");
        verify(webhookRepository).save(legacy);
        verify(deliveryRepository).save(any());
    }

    @Test
    @DisplayName("ping n'est jamais envoyé par abonnement, seulement à la demande")
    void ping_is_never_subscribed() {
        when(webhookRepository.findByWorkspaceIdAndActiveTrue(1L)).thenReturn(List.of(webhook(1, "s1")));

        outbox.onEvent(new WorkspaceWebhookEvent(1L, WebhookEventType.PING, null, Map.of(), null));

        verify(deliveryRepository, never()).save(any());
    }

    @Test
    @DisplayName("test à la demande : un envoi ping réservé jusqu'à l'échéance donnée")
    void enqueue_test_reserves_the_delivery() {
        when(deliveryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        LocalDateTime until = LocalDateTime.now().plusMinutes(2);

        WebhookDelivery delivery = outbox.enqueueTest(webhook(1, "s1", "issue.created"), null, until);

        assertThat(delivery.getEventType()).isEqualTo("ping");
        assertThat(delivery.getNextAttemptAt()).isEqualTo(until);
        assertThat(delivery.getPayload()).contains("\"type\":\"ping\"").contains("\"actor\":null");
    }

    @Test
    @DisplayName("un corps impossible à sérialiser n'interrompt pas le changement : rien n'est écrit")
    void serialization_failure_is_contained() {
        when(webhookRepository.findByWorkspaceIdAndActiveTrue(1L)).thenReturn(List.of(webhook(1, "s1")));

        outbox.onEvent(new WorkspaceWebhookEvent(1L, WebhookEventType.ISSUE_CREATED, null, new Object(), null));

        verify(deliveryRepository, never()).save(any());
    }
}
