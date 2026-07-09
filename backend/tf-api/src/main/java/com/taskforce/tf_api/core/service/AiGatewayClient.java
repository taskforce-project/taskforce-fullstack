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

    @Value("${ai.gateway.base-url:http://ai-service:8000}")
    private String baseUrl;

    public AiGatewayClient(ObjectMapper objectMapper) {
        // Timeout large : la génération locale d'un 14B peut prendre plusieurs dizaines de secondes.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(180000);
        this.restTemplate = new RestTemplate();
        this.restTemplate.setRequestFactory(factory);
        this.objectMapper = objectMapper;
    }

    /** Actif dès qu'il est sélectionné (provider=ollama) ; les échecs d'appel retombent en repli côté agent. */
    @Override
    public boolean isConfigured() {
        return true;
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
            return root.path("message");
        } catch (Exception ex) {
            log.error("AI Gateway error: {}", ex.getMessage());
            throw new LlmException("AI Gateway indisponible: " + ex.getMessage(), ex);
        }
    }

    public static class LlmException extends RuntimeException {
        public LlmException(String message, Throwable cause) { super(message, cause); }
    }
}
