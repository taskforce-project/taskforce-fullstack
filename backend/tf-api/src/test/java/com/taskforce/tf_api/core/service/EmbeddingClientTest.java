package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;
import com.taskforce.tf_api.core.service.ai.AiProviderSettings;
import com.taskforce.tf_api.core.service.ai.ModelGateway;
import com.taskforce.tf_api.core.service.ai.ModelProviderException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** {@link EmbeddingClient} : best-effort, par la passerelle de modèles, avec le modèle de l'état de l'IA. */
@DisplayName("EmbeddingClient")
class EmbeddingClientTest {

    private static final AiProviderSettings SETTINGS = AiProviderSettings.from(Map.<String, String>of()::get);
    private static final AiStatus AVAILABLE = new AiStatus(true, true, "m", "f", true, "bge-m3");
    private static final AiStatus NO_EMBEDDINGS = new AiStatus(true, true, "m", "f", false, "bge-m3");

    private ModelGateway gateway;
    private AiStatusService status;
    private EmbeddingClient client;

    @BeforeEach
    void setUp() {
        gateway = mock(ModelGateway.class);
        status = mock(AiStatusService.class);
        ready(AVAILABLE);
        client = new EmbeddingClient(gateway, status);
    }

    private void ready(AiStatus current) {
        when(status.current()).thenReturn(current);
        when(status.snapshot()).thenReturn(new AiStatusService.Snapshot(SETTINGS, current, true, List.of(), List.of()));
    }

    @Test
    @DisplayName("embed : un vecteur, avec le modèle de l'état de l'IA")
    void embed() {
        when(gateway.embed(SETTINGS, "bge-m3", List.of("hello"))).thenReturn(List.of(new float[]{1.0f, 2.0f, 3.5f}));

        assertThat(client.embed("hello")).containsExactly(1.0f, 2.0f, 3.5f);
    }

    @Test
    @DisplayName("embedBatch : un vecteur par texte, dans l'ordre ; un compte faux vaut null")
    void batch() {
        when(gateway.embed(any(), eq("bge-m3"), eq(List.of("a", "b"))))
            .thenReturn(List.of(new float[]{1.0f}, new float[]{3.0f, 4.0f}));
        when(gateway.embed(any(), eq("bge-m3"), eq(List.of("x", "y")))).thenReturn(List.of(new float[]{1.0f}));

        assertThat(client.embedBatch(List.of("a", "b")).get(1)).containsExactly(3.0f, 4.0f);
        assertThat(client.embedBatch(List.of("x", "y"))).isNull();
    }

    @Test
    @DisplayName("fournisseur en erreur : null, et l'état de l'IA sera relu")
    void failureReturnsNull() {
        when(gateway.embed(any(), any(), any())).thenThrow(new ModelProviderException("Embeddings refused (HTTP 500)"));

        assertThat(client.embed("x")).isNull();
        verify(status).invalidate();
    }

    @Test
    @DisplayName("sans modèle d'embeddings disponible : aucun appel, null, pas de modèle courant")
    void unavailableMakesNoCall() {
        ready(NO_EMBEDDINGS);

        assertThat(client.embed("x")).isNull();
        assertThat(client.currentModel()).isNull();
        assertThat(client.isAvailable()).isFalse();
        verifyNoInteractions(gateway);
    }

    @Test
    @DisplayName("modèle courant = celui de l'état de l'IA")
    void currentModel() {
        assertThat(client.currentModel()).isEqualTo("bge-m3");
        assertThat(client.isAvailable()).isTrue();
    }

    @Test
    @DisplayName("toVectorLiteral formate un vecteur en littéral pgvector")
    void vectorLiteral() {
        assertThat(EmbeddingClient.toVectorLiteral(new float[]{0.1f, 0.2f})).isEqualTo("[0.1,0.2]");
        assertThat(EmbeddingClient.DIMENSIONS).isEqualTo(1024);
    }
}
