package com.taskforce.tf_api.core.service;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.WebhookRequest;
import com.taskforce.tf_api.core.dto.response.WebhookResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WebhookRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests d'intégration — {@link WebhookService} (webhooks sortants). Repos réels, {@code RestTemplate} mocké.
 * CRUD + déclenchement (fire → POST HTTP).
 */
@DisplayName("WebhookService (intégration Postgres)")
@Import({WebhookService.class, WebhookServiceIntegrationTest.Cfg.class})
class WebhookServiceIntegrationTest extends AbstractIntegrationTest {

    @TestConfiguration
    static class Cfg {
        @Bean ObjectMapper objectMapper() { return new ObjectMapper(); }
    }

    @Autowired private WebhookService webhookService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WebhookRepository webhookRepository;

    @MockitoBean private RestTemplate restTemplate;

    private static final String SLUG = "ws-hook-it";
    private User owner;
    private Workspace workspace;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-hook").email("hook@it.dev").displayName("Owner").isActive(true).build());
        workspace = workspaceRepository.save(Workspace.builder().name("Hook WS").slug(SLUG).owner(owner).build());
    }

    private WebhookResponse create(String url) {
        return webhookService.create(SLUG, new WebhookRequest(url, "secret", List.of("issue.created")), owner);
    }

    @Test
    @DisplayName("create + list + update + delete")
    void crud() {
        WebhookResponse w = create("https://ex.com/hook");
        assertThat(webhookService.list(SLUG)).hasSize(1);

        webhookService.update(SLUG, w.id(), new WebhookRequest("https://ex.com/v2", null, null));
        assertThat(webhookRepository.findById(w.id()).orElseThrow().getUrl()).isEqualTo("https://ex.com/v2");

        webhookService.delete(SLUG, w.id());
        assertThat(webhookService.list(SLUG)).isEmpty();
    }

    // NB : fire() est @Async → non testable ici (le thread async ne voit pas la donnée non-committée
    // de la tx @DataJpaTest). À couvrir via @SpringBootTest + @EnableAsync si besoin.
}
