package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** État de l'IA lu sur {@code GET /v1/status} de l'ai-service, gardé en cache, et repli quand il ne répond pas. */
@DisplayName("AiStatusService")
class AiStatusServiceTest {

    private static final String URL = "http://ai-service:8000/v1/status";
    private static final String READY = "{\"configured\":true,"
        + "\"chat\":{\"model\":\"qwen3:8b\",\"model_fast\":\"qwen3:4b\",\"available\":true},"
        + "\"embeddings\":{\"model\":\"bge-m3\",\"dimensions\":1024,\"available\":false}}";

    private AiStatusService service;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        service = new AiStatusService(new ObjectMapper(), "http://ai-service:8000/", "secret");
        server = MockRestServiceServer.createServer((RestTemplate) ReflectionTestUtils.getField(service, "http"));
    }

    @Test
    @DisplayName("lit l'état avec le secret partagé et le garde en cache")
    void reads_and_caches() {
        server.expect(ExpectedCount.once(), requestTo(URL))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer secret"))
            .andRespond(withSuccess(READY, MediaType.APPLICATION_JSON));

        AiStatus first = service.current();
        AiStatus second = service.current();

        assertThat(first).isEqualTo(new AiStatus(true, true, "qwen3:8b", "qwen3:4b", false, "bge-m3"));
        assertThat(second).isSameAs(first);
        server.verify();
    }

    @Test
    @DisplayName("invalidate : le prochain appel relit l'ai-service")
    void invalidate_refetches() {
        server.expect(ExpectedCount.twice(), requestTo(URL)).andRespond(withSuccess(READY, MediaType.APPLICATION_JSON));

        service.current();
        service.invalidate();
        service.current();

        server.verify();
    }

    @ParameterizedTest(name = "HTTP {0} → IA indisponible")
    @ValueSource(ints = {401, 503, 500})
    @DisplayName("ai-service qui refuse ou tombe → IA indisponible, sans exception")
    void failure_means_unreachable(int code) {
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.valueOf(code)));

        assertThat(service.current()).isEqualTo(AiStatus.UNREACHABLE);
        server.verify();
    }
}
