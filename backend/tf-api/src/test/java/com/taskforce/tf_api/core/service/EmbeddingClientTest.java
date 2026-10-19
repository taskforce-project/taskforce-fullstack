package com.taskforce.tf_api.core.service;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Contrat (format HTTP) d'{@link EmbeddingClient} avec l'ai-service : {@code POST /v1/embeddings}, secret
 * partagé en Bearer, {@code {texts:[...]}} en entrée, {@code {vectors:[[...]]}} en sortie. Sans modèle
 * d'embeddings disponible, aucun appel n'est fait.
 */
@DisplayName("EmbeddingClient (contrat avec l'ai-service)")
class EmbeddingClientTest {

    private static final AiStatus AVAILABLE = new AiStatus(true, true, "m", "f", true, "bge-m3");
    private static final AiStatus NO_EMBEDDINGS = new AiStatus(true, true, "m", "f", false, "bge-m3");

    private AiStatusService status;
    private EmbeddingClient client;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        status = mock(AiStatusService.class);
        when(status.current()).thenReturn(AVAILABLE);
        client = new EmbeddingClient(status, "http://ai-service:8000", "secret");
        RestTemplate rt = (RestTemplate) ReflectionTestUtils.getField(client, "http");
        server = MockRestServiceServer.createServer(rt);
    }

    @Test
    @DisplayName("embed : POST /v1/embeddings avec le secret partagé, {texts:[...]} et lecture de {vectors}")
    void embed_posts_and_parses() {
        server.expect(requestTo("http://ai-service:8000/v1/embeddings"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer secret"))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.texts[0]").value("hello"))
            .andRespond(withSuccess("{\"vectors\":[[1.0,2.0,3.5]]}", MediaType.APPLICATION_JSON));

        float[] vec = client.embed("hello");

        assertThat(vec).containsExactly(1.0f, 2.0f, 3.5f);
        server.verify();
    }

    @Test
    @DisplayName("embedBatch : un vecteur par texte, dans l'ordre")
    void embed_batch_maps_all() {
        server.expect(requestTo("http://ai-service:8000/v1/embeddings"))
            .andRespond(withSuccess("{\"vectors\":[[1.0,2.0],[3.0,4.0]]}", MediaType.APPLICATION_JSON));

        List<float[]> vecs = client.embedBatch(List.of("a", "b"));

        assertThat(vecs).hasSize(2);
        assertThat(vecs.get(1)).containsExactly(3.0f, 4.0f);
        server.verify();
    }

    @Test
    @DisplayName("ai-service en erreur → null, et l'état de l'IA sera relu")
    void server_error_returns_null() {
        server.expect(requestTo("http://ai-service:8000/v1/embeddings")).andRespond(withServerError());

        assertThat(client.embed("x")).isNull();
        server.verify();
        verify(status).invalidate();
    }

    @Test
    @DisplayName("réponse incomplète (pas de vecteurs, ou pas autant que de textes) → null")
    void incomplete_answer_returns_null() {
        server.expect(requestTo("http://ai-service:8000/v1/embeddings"))
            .andRespond(withSuccess("{\"vectors\":[[1.0]]}", MediaType.APPLICATION_JSON));

        assertThat(client.embedBatch(List.of("x", "y"))).isNull();
        server.verify();
    }

    @Test
    @DisplayName("sans modèle d'embeddings disponible → aucun appel, null, pas de modèle courant")
    void unavailable_makes_no_call() {
        when(status.current()).thenReturn(NO_EMBEDDINGS);

        assertThat(client.embed("x")).isNull();
        assertThat(client.currentModel()).isNull();
        server.verify(); // aucune requête attendue, aucune reçue
    }

    @Test
    @DisplayName("modèle courant = celui annoncé par l'ai-service")
    void current_model() {
        assertThat(client.currentModel()).isEqualTo("bge-m3");
        assertThat(client.isAvailable()).isTrue();
    }

    @Test
    @DisplayName("toVectorLiteral formate un vecteur en littéral pgvector")
    void vector_literal() {
        assertThat(EmbeddingClient.toVectorLiteral(new float[]{0.1f, 0.2f})).isEqualTo("[0.1,0.2]");
    }
}
