package com.taskforce.tf_api.core.service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

/**
 * {@link LlmClient} vers l'ai-service ({@code POST /v1/chat}), qui parle au fournisseur configuré (Ollama par
 * défaut, ou toute API compatible OpenAI) et choisit le modèle selon le tier. Appels authentifiés par le
 * secret partagé {@code AI_SERVICE_TOKEN}.
 *
 * <p>Quand l'IA n'est pas disponible ({@link AiStatusService}), l'appel échoue tout de suite au lieu d'attendre
 * le délai de lecture : les appelants passent à leur repli sans bloquer la requête.</p>
 */
@Service
@Slf4j
public class AiGatewayClient implements LlmClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final AiStatusService status;
    private final String chatUrl;
    private final String token;

    /** Accumulateur d'usage par thread : [prompt, completion, total]. {@code null} = capture inactive. */
    private final ThreadLocal<long[]> usageAccumulator = new ThreadLocal<>();

    public AiGatewayClient(ObjectMapper objectMapper, AiStatusService status,
                           @Value("${ai.service.url:http://ai-service:8000}") String serviceUrl,
                           @Value("${ai.service.token:}") String token,
                           @Value("${ai.service.read-timeout-ms:150000}") int readTimeoutMs) {
        // Le délai de lecture doit rester au-dessus de AI_TIMEOUT de l'ai-service (120 s par défaut) :
        // sinon Java coupe pendant que le modèle termine sa réponse.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(readTimeoutMs);
        this.restTemplate = new RestTemplate(factory);
        this.objectMapper = objectMapper;
        this.status = status;
        this.chatUrl = serviceUrl.replaceAll("/+$", "") + "/v1/chat";
        this.token = token;
    }

    @Override
    public boolean isConfigured() {
        return status.current().chatAvailable();
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
    public String chatCompletion(String systemPrompt, String userPrompt, boolean jsonMode, String tier) {
        JsonNode message = callChat(
            List.of(Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user",   "content", userPrompt)),
            null, jsonMode, tier);
        return message.path("content").asText("");
    }

    @Override
    public JsonNode rawChat(List<Map<String, Object>> messages, List<Map<String, Object>> tools, String tier) {
        return callChat(messages, tools, false, tier);
    }

    private JsonNode callChat(List<?> messages, List<Map<String, Object>> tools, boolean jsonMode, String tier) {
        if (!isConfigured()) {
            throw new LlmException("AI is not available on this instance", null);
        }
        Map<String, Object> body = new HashMap<>();
        body.put("messages", messages);
        body.put("json_mode", jsonMode);
        if (tier != null) {
            body.put("tier", tier);
        }
        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools);
        }
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token == null ? "" : token);
        try {
            String raw = restTemplate.postForObject(chatUrl, new HttpEntity<>(body, headers), String.class);
            JsonNode root = objectMapper.readTree(raw);
            accumulateUsage(root.path("usage"));
            return root.path("message");
        } catch (Exception ex) {
            if (toolsRefused(ex)) { // le fournisseur répond : son état reste valable
                log.error("AI provider refused the tools: {}", ex.getMessage());
                throw new LlmToolsRefusedException("The AI provider refused the tools", ex);
            }
            log.error("AI service call failed: {}", ex.getMessage());
            status.invalidate(); // le fournisseur est peut-être tombé : on relira son état au prochain appel
            throw new LlmException("AI service unavailable: " + ex.getMessage(), ex);
        }
    }

    /**
     * Le fournisseur refuse les outils, même un seul : 422 avec le code {@code tools_refused}. FastAPI répond aussi 422
     * pour un corps invalide, et son message peut citer ce qu'on lui a envoyé : on lit le code, pas le texte.
     */
    private boolean toolsRefused(Exception ex) {
        if (!(ex instanceof HttpClientErrorException error) || error.getStatusCode().value() != 422) {
            return false;
        }
        try {
            JsonNode detail = objectMapper.readTree(error.getResponseBodyAsString()).path("detail");
            return "tools_refused".equals(detail.path("code").asText());
        } catch (Exception unreadable) {
            return false;
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
