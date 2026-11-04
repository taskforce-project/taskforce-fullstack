package com.taskforce.tf_api.core.service.delivery;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.service.AiStatusService;
import com.taskforce.tf_api.core.service.ai.AiProviderSettings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * L'agent à l'essai dans le menu de délégation (R51) : un seul nom, celui du modèle ; à l'essai ; seulement pour une
 * tâche sans dépôt ; perdu, il le dit au lieu de rester « en cours ».
 */
@DisplayName("Agent à l'essai : le provider")
class TrialAgentProviderTest {

    private final AiStatusService aiStatus = mock(AiStatusService.class);
    private final TrialAgentLoop loop = mock(TrialAgentLoop.class);
    private final TrialAgentProvider provider = new TrialAgentProvider(aiStatus, loop);

    @BeforeEach
    void ollama() {
        ready(new AiStatusService.AiStatus(true, true, "qwen3:8b", "qwen3:8b", true, "bge-m3"));
    }

    private void ready(AiStatusService.AiStatus status) {
        when(aiStatus.current()).thenReturn(status);
        when(aiStatus.snapshot()).thenReturn(new AiStatusService.Snapshot(
            AiProviderSettings.from(Map.of("AI_PROVIDER", "ollama")::get), status, true, List.of(), List.of()));
    }

    private static DeliveryContext context(String repo) {
        return new DeliveryContext(7L, null, Project.builder().id(3L).repoFullName(repo).build());
    }

    @Test
    @DisplayName("le nom du modèle, à l'essai, et jamais proposé pour une tâche qui a un dépôt")
    void namedAfterItsModelAndOnlyWithoutARepository() {
        assertThat(provider.key()).isEqualTo("taskforce-agent");
        assertThat(provider.displayName()).isEqualTo("qwen3:8b");
        assertThat(provider.models()).containsExactly("qwen3:8b");
        assertThat(provider.logoKey()).isEqualTo("ollama");
        assertThat(provider.trial()).isTrue();
        assertThat(provider.available()).isTrue();
        assertThat(provider.pullBased()).isFalse();
        assertThat(provider.shownFor(context(null))).isTrue();
        assertThat(provider.unavailableReason(context(null))).isNull();
        assertThat(provider.shownFor(context("acme/site"))).isFalse();
        assertThat(provider.unavailableReason(context("acme/site"))).contains("without a repository");
        assertThat(provider.shownFor(new DeliveryContext(7L, null, null))).isTrue();
    }

    @Test
    @DisplayName("sans IA qui répond : ni nom de modèle ni délégation possible")
    void unavailableWithoutAi() {
        ready(new AiStatusService.AiStatus(true, false, null, null, false, null));

        assertThat(provider.displayName()).isEqualTo("TaskForce agent");
        assertThat(provider.models()).isEmpty();
        assertThat(provider.available()).isFalse();
        assertThat(provider.unavailableReason(context(null))).contains("isn't answering");
    }

    @Test
    @DisplayName("lancé, il court tant que ce backend le connaît ; perdu après un redémarrage, il le dit")
    void runsWhileItsBackendKnowsIt() {
        DeliveryDispatch dispatch = provider.dispatch(90L, new AgentBrief(55L, 1L, "T", null, null, "qwen3:8b"));

        assertThat(dispatch.externalRef()).startsWith("trial:");
        assertThat(dispatch.immediateResult()).isNull();
        verify(loop).start(eq(90L), anyString());
        when(loop.knows(dispatch.externalRef())).thenReturn(true);
        assertThat(provider.poll(dispatch.externalRef(), 1L).status()).isEqualTo(DeliveryRunStatus.RUNNING);
        DeliveryPoll lost = provider.poll("trial:gone", 1L);
        assertThat(lost.status()).isEqualTo(DeliveryRunStatus.FAILED);
        assertThat(lost.error()).contains("Delegate the task again");
    }
}
