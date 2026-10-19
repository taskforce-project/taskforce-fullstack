package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.taskforce.tf_api.core.dto.request.WebhookRequest;
import com.taskforce.tf_api.core.dto.response.CreatedWebhookResponse;
import com.taskforce.tf_api.core.dto.response.WebhookResponse;
import com.taskforce.tf_api.core.enums.WebhookDeliveryStatus;
import com.taskforce.tf_api.core.enums.WebhookEventType;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Webhook;
import com.taskforce.tf_api.core.model.WebhookDelivery;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WebhookDeliveryRepository;
import com.taskforce.tf_api.core.repository.WebhookRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.webhook.WebhookDispatcher;
import com.taskforce.tf_api.core.service.webhook.WebhookOutbox;
import com.taskforce.tf_api.core.service.webhook.WorkspaceWebhookEvent;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests d'intégration de {@link WebhookService} et de la file d'envoi (OSS-6.2) sur un vrai Postgres : gestion
 * réservée aux gestionnaires, secret montré une fois, envois écrits par {@link WebhookOutbox}, requête native de
 * prise des envois dus ({@code FOR UPDATE SKIP LOCKED}) et purge de rétention. L'envoi HTTP est couvert par
 * {@code WebhookDispatcherTest}.
 */
@DisplayName("WebhookService (intégration Postgres)")
@Import({WebhookService.class, AuthorizationService.class, WebhookOutbox.class, WebhookDispatcher.class,
    WebhookServiceIntegrationTest.Cfg.class})
@TestPropertySource(properties = "taskforce.webhooks.dispatch-interval-ms=3600000")
class WebhookServiceIntegrationTest extends AbstractIntegrationTest {

    @TestConfiguration
    static class Cfg {
        @Bean ObjectMapper objectMapper() {
            ObjectMapper mapper = new ObjectMapper();
            mapper.registerModule(new JavaTimeModule());
            mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
            return mapper;
        }

        @Bean TransactionTemplate transactionTemplate(PlatformTransactionManager transactionManager) {
            return new TransactionTemplate(transactionManager);
        }
    }

    @Autowired private WebhookService webhookService;
    @Autowired private WebhookOutbox outbox;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WebhookRepository webhookRepository;
    @Autowired private WebhookDeliveryRepository deliveryRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private JdbcTemplate jdbc;

    private static final String SLUG = "ws-hook-it";
    // IP publique littérale (TEST-NET-3, RFC 5737) : passe la garde anti-SSRF sans résolution DNS.
    private static final String URL = "https://203.0.113.10/hook";
    private User owner;
    private Workspace workspace;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-hook").email("hook@it.dev").displayName("Owner").isActive(true).build());
        workspace = workspaceRepository.save(Workspace.builder().name("Hook WS").slug(SLUG).owner(owner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder()
            .workspace(workspace).user(owner).role(WorkspaceRole.OWNER).build());
    }

    private CreatedWebhookResponse create(List<String> events) {
        return webhookService.create(SLUG, new WebhookRequest(URL, events, null), owner);
    }

    private User member() {
        User member = userRepository.save(User.builder()
            .keycloakId("kc-hook-member").email("member@it.dev").displayName("Member").isActive(true).build());
        workspaceMemberRepository.save(WorkspaceMember.builder()
            .workspace(workspace).user(member).role(WorkspaceRole.MEMBER).build());
        return member;
    }

    @Test
    @DisplayName("création avec un secret montré une fois, liste, modification, nouveau secret, suppression")
    void crud() {
        CreatedWebhookResponse created = create(List.of("issue.created"));
        assertThat(created.secret()).startsWith("whsec_");
        assertThat(created.webhook().active()).isTrue();
        Long id = created.webhook().id();
        assertThat(webhookService.list(SLUG, owner.getId())).extracting(WebhookResponse::id).containsExactly(id);

        WebhookResponse updated = webhookService.update(SLUG, id,
            new WebhookRequest("https://203.0.113.10/v2", List.of("issue.created", "comment.created"), false), owner.getId());
        assertThat(updated.url()).isEqualTo("https://203.0.113.10/v2");
        assertThat(updated.eventTypes()).containsExactly("issue.created", "comment.created");
        assertThat(updated.active()).isFalse();

        String renewed = webhookService.regenerateSecret(SLUG, id, owner.getId()).secret();
        assertThat(renewed).startsWith("whsec_").isNotEqualTo(created.secret());
        assertThat(webhookRepository.findById(id).orElseThrow().getSecret()).isEqualTo(renewed);

        webhookService.delete(SLUG, id, owner.getId());
        assertThat(webhookService.list(SLUG, owner.getId())).isEmpty();
    }

    @Test
    @DisplayName("un événement inconnu est refusé, avec la liste des événements possibles")
    void unknown_event_is_refused() {
        assertThatThrownBy(() -> create(List.of("issue.created", "issue.exploded")))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("issue.exploded")
            .hasMessageContaining("comment.created");
    }

    @Test
    @DisplayName("une adresse interne est refusée, même pour un propriétaire (anti-SSRF → 400)")
    void internal_url_is_refused() {
        assertThatThrownBy(() -> webhookService.create(
                SLUG, new WebhookRequest("http://169.254.169.254/latest/meta-data/", List.of(), null), owner))
            .isInstanceOf(IllegalArgumentException.class);
        assertThat(webhookService.list(SLUG, owner.getId())).isEmpty();
    }

    @Test
    @DisplayName("un simple membre ne peut ni gérer ni lister les webhooks (leur URL vaut souvent un secret)")
    void member_cannot_manage_nor_list() {
        User member = member();

        assertThatThrownBy(() -> webhookService.create(SLUG, new WebhookRequest(URL, List.of(), null), member))
            .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> webhookService.list(SLUG, member.getId()))
            .isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("un événement écrit un envoi en attente pour chaque webhook abonné, visible dans l'historique")
    void event_queues_deliveries() {
        Long subscribed = create(List.of("issue.created")).webhook().id();
        Long other = create(List.of("comment.created")).webhook().id();

        outbox.onEvent(new WorkspaceWebhookEvent(workspace.getId(), WebhookEventType.ISSUE_CREATED, owner.getId(),
            Map.of("issue", Map.of("id", 1, "title", "Fix login")), "/ws-hook-it/projects/1/issues/1"));

        assertThat(webhookService.deliveries(SLUG, subscribed, owner.getId())).singleElement().satisfies(d -> {
            assertThat(d.eventType()).isEqualTo("issue.created");
            assertThat(d.status()).isEqualTo("PENDING");
            assertThat(d.attempts()).isZero();
        });
        assertThat(webhookService.deliveries(SLUG, other, owner.getId())).isEmpty();
    }

    @Test
    @DisplayName("prise des envois dus : seulement ceux en attente et échus")
    void lock_due_takes_only_due_pending_deliveries() {
        Webhook webhook = webhookRepository.findById(create(List.of()).webhook().id()).orElseThrow();
        WebhookDelivery due = delivery(webhook, WebhookDeliveryStatus.PENDING, LocalDateTime.now().minusSeconds(5));
        delivery(webhook, WebhookDeliveryStatus.PENDING, LocalDateTime.now().plusMinutes(5));
        delivery(webhook, WebhookDeliveryStatus.DELIVERED, LocalDateTime.now().minusSeconds(5));
        deliveryRepository.flush();

        assertThat(deliveryRepository.lockDue(LocalDateTime.now(), 10))
            .extracting(WebhookDelivery::getId).containsExactly(due.getId());
    }

    @Test
    @DisplayName("rétention : les envois terminés anciens partent, ceux en attente et récents restent")
    void retention_purges_old_finished_deliveries() {
        Webhook webhook = webhookRepository.findById(create(List.of()).webhook().id()).orElseThrow();
        WebhookDelivery oldDelivered = delivery(webhook, WebhookDeliveryStatus.DELIVERED, LocalDateTime.now());
        WebhookDelivery oldFailed = delivery(webhook, WebhookDeliveryStatus.FAILED, LocalDateTime.now());
        WebhookDelivery oldPending = delivery(webhook, WebhookDeliveryStatus.PENDING, LocalDateTime.now());
        WebhookDelivery recent = delivery(webhook, WebhookDeliveryStatus.DELIVERED, LocalDateTime.now());
        deliveryRepository.flush();
        for (WebhookDelivery d : List.of(oldDelivered, oldFailed, oldPending)) {
            jdbc.update("UPDATE webhook_deliveries SET created_at = now() - interval '40 days' WHERE id = ?", d.getId());
        }

        int purged = deliveryRepository.deleteFinishedBefore(LocalDateTime.now().minusDays(30));

        assertThat(purged).isEqualTo(2);
        assertThat(jdbc.queryForList("SELECT id FROM webhook_deliveries WHERE webhook_id = ?", Long.class, webhook.getId()))
            .containsExactlyInAnyOrder(oldPending.getId(), recent.getId());
    }

    private WebhookDelivery delivery(Webhook webhook, WebhookDeliveryStatus status, LocalDateTime nextAttemptAt) {
        return deliveryRepository.save(WebhookDelivery.builder().webhook(webhook).deliveryId(UUID.randomUUID())
            .eventType("issue.created").payload("{}").status(status).nextAttemptAt(nextAttemptAt).build());
    }
}
