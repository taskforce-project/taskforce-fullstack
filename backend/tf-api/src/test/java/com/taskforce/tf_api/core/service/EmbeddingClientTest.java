package com.taskforce.tf_api.core.service;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Contract test (wire) — {@link EmbeddingClient} contre l'ai-service (embeddings RAG).
 *
 * <p>Utilise {@link MockRestServiceServer} lié au {@code RestTemplate} interne du client : valide le
 * <b>vrai format de requête HTTP</b> (URL {@code /v1/embeddings}, POST, JSON {@code {texts:[...]}})
 * et le parsing de la réponse {@code {vectors:[[...]]}} — pas seulement la logique Java.</p>
 */
@DisplayName("EmbeddingClient (contract wire ai-service)")
class EmbeddingClientTest {

    private EmbeddingClient client;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        client = new EmbeddingClient("http://ai-service:8000");
        RestTemplate rt = (RestTemplate) ReflectionTestUtils.getField(client, "http");
        server = MockRestServiceServer.createServer(rt);
    }

    @Test
    @DisplayName("embed : POST /v1/embeddings avec {texts:[...]} et parse {vectors:[[...]]}")
    void embed_posts_and_parses() {
        server.expect(requestTo("http://ai-service:8000/v1/embeddings"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.texts[0]").value("bonjour"))
            .andRespond(withSuccess("{\"vectors\":[[1.0,2.0,3.5]]}", MediaType.APPLICATION_JSON));

        float[] vec = client.embed("bonjour");

        assertThat(vec).containsExactly(1.0f, 2.0f, 3.5f);
        server.verify();
    }

    @Test
    @DisplayName("embedBatch : mappe chaque vecteur de la réponse")
    void embed_batch_maps_all() {
        server.expect(requestTo("http://ai-service:8000/v1/embeddings"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withSuccess("{\"vectors\":[[1.0,2.0],[3.0,4.0]]}", MediaType.APPLICATION_JSON));

        List<float[]> vecs = client.embedBatch(List.of("a", "b"));

        assertThat(vecs).hasSize(2);
        assertThat(vecs.get(1)).containsExactly(3.0f, 4.0f);
        server.verify();
    }

    @Test
    @DisplayName("ai-service en erreur (500) → embed retourne null (repli gracieux, pas d'exception)")
    void embed_returns_null_on_server_error() {
        server.expect(requestTo("http://ai-service:8000/v1/embeddings"))
            .andRespond(withServerError());

        assertThat(client.embed("x")).isNull();
        server.verify();
    }

    @Test
    @DisplayName("réponse sans clé 'vectors' → null")
    void embed_returns_null_when_no_vectors() {
        server.expect(requestTo("http://ai-service:8000/v1/embeddings"))
            .andRespond(withSuccess("{\"foo\":1}", MediaType.APPLICATION_JSON));

        assertThat(client.embedBatch(List.of("x"))).isNull();
        server.verify();
    }

    @Test
    @DisplayName("toVectorLiteral formate un vecteur en littéral pgvector")
    void vector_literal() {
        assertThat(EmbeddingClient.toVectorLiteral(new float[]{0.1f, 0.2f})).startsWith("[").endsWith("]").contains(",");
    }
}
