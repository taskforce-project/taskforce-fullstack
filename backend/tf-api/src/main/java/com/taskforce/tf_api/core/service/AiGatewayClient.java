package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

/**
 * {@link LlmClient} vers l'**AI Gateway** (service Python {@code ai-service}) qui route vers le LLM
 * local **Ollama** (Qwen). Le backend ne connaît pas le modèle : il parle au gateway ({@code /v1/chat}),
 * qui possède le routing modèle. Réponse du gateway : {@code {model, message}} (format OpenAI).
 *
 * <p>Timeout large : la génération locale d'un 14B peut prendre plusieurs dizaines de secondes.</p>
 */
@Service
@Slf4j
public class AiGatewayClient implements LlmClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    /** Accumulateur d'usage par thread : [prompt, completion, total]. {@code null} = capture inactive. */
    private final ThreadLocal<long[]> usageAccumulator = new ThreadLocal<>();

    @Value("${ai.gateway.base-url:http://ai-service:8000}")
    private String baseUrl;

    public AiGatewayClient(ObjectMapper objectMapper,
                           @Value("${ai.gateway.read-timeout-ms:300000}") int readTimeoutMs) {
        // Timeout large : une analyse APPROFONDIE sur le 14B local peut dépasser plusieurs minutes.
        // Doit rester ≥ OLLAMA_TIMEOUT de l'ai-service, sinon Java coupe avant la fin de génération.
        // Surchargeable sans rebuild via env AI_GATEWAY_READ_TIMEOUT_MS.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(readTimeoutMs);
        this.restTemplate = new RestTemplate();
        this.restTemplate.setRequestFactory(factory);
        this.objectMapper = objectMapper;
    }

    /** Actif dès qu'il est sélectionné (provider=ollama) ; les échecs d'appel retombent en repli côté agent. */
    @Override
    public boolean isConfigured() {
        return true;
    }

    // ── Capture d'usage (tokens) — cf. LlmClient ─────────────────────────────

    @Override
    public void beginUsageCapture() {
        usageAccumulator.set(new long[3]);
    }

    @Override
    public LlmUsage currentUsage() {
        long[] a = usageAccumulator.get();
        return a == null ? LlmUsage.ZERO : new LlmUsage(a[0], a[1], a[2]);
    }

    @Override
    public void endUsageCapture() {
        usageAccumulator.remove();
    }

    @Override
    public String chatCompletion(String model, String systemPrompt, String userPrompt, boolean jsonMode) {
        return chatCompletion(model, systemPrompt, userPrompt, jsonMode, null);
    }

    @Override
    public String chatCompletion(String model, String systemPrompt, String userPrompt, boolean jsonMode, String tier) {
        JsonNode message = callChat(
            List.of(Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user",   "content", userPrompt)),
            null, jsonMode, tier);
        return message.path("content").asText("");
    }

    @Override
    public JsonNode rawChat(String model, List<Map<String, Object>> messages, List<Map<String, Object>> tools) {
        return callChat(messages, tools, false, null);
    }

    @Override
    public JsonNode rawChat(String model, List<Map<String, Object>> messages, List<Map<String, Object>> tools, String tier) {
        return callChat(messages, tools, false, tier);
    }

    private JsonNode callChat(List<?> messages, List<Map<String, Object>> tools, boolean jsonMode, String tier) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("messages", messages);
        body.put("json_mode", jsonMode);
        if (tier != null) {
            body.put("tier", tier);
        }
        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools);
        }
        // model volontairement omis → le gateway utilise son modèle par défaut (Ollama OLLAMA_MODEL).
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        try {
            String raw = restTemplate.postForObject(baseUrl + "/v1/chat",
                new HttpEntity<>(body, headers), String.class);
            JsonNode root = objectMapper.readTree(raw);
            accumulateUsage(root.path("usage"));
            return root.path("message");
        } catch (Exception ex) {
            log.error("AI Gateway error: {}", ex.getMessage());
            throw new LlmException("AI Gateway indisponible: " + ex.getMessage(), ex);
        }
    }

    /** Additionne l'usage d'une réponse à l'accumulateur du thread (si la capture est active). */
    private void accumulateUsage(JsonNode usage) {
        long[] acc = usageAccumulator.get();
        if (acc == null || !usage.isObject()) {
            return;
        }
        acc[0] += usage.path("prompt_tokens").asLong(0);
        acc[1] += usage.path("completion_tokens").asLong(0);
        acc[2] += usage.path("total_tokens").asLong(0);
    }

    public static class LlmException extends RuntimeException {
        public LlmException(String message, Throwable cause) { super(message, cause); }
    }
}
