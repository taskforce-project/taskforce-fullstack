package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

/**
 * Client HTTP vers l'API Groq (compatible OpenAI).
 *
 * Endpoint de base : https://api.groq.com/openai/v1
 *
 * Deux usages :
 *  - chatCompletion()  → Smart Assign (JSON mode, réponse unique)
 *  - streamCompletion() → Assistant IA (chunks SSE)
 */
@Service
@Slf4j
public class GroqService {

    private static final String GROQ_BASE_URL = "https://api.groq.com/openai/v1";

    private final RestTemplate groqRestTemplate;
    private final ObjectMapper objectMapper;

    @Value("${ai.groq.api-key:}")
    private String apiKey;

    public GroqService(@Qualifier("groqRestTemplate") RestTemplate groqRestTemplate,
                       ObjectMapper objectMapper) {
        this.groqRestTemplate = groqRestTemplate;
        this.objectMapper     = objectMapper;
    }

    /**
     * Appel chat/completions non-streamé.
     * Retourne le contenu textuel du premier choix.
     *
     * @param model       identifiant du modèle Groq
     * @param systemPrompt instruction système
     * @param userPrompt  message utilisateur
     * @param jsonMode    si true, force la réponse en JSON valide
     * @return contenu brut retourné par le modèle
     * @throws GroqException si l'API retourne une erreur ou la clé est absente
     */
    public String chatCompletion(String model, String systemPrompt, String userPrompt, boolean jsonMode) {
        assertApiKeyPresent();

        Map<String, Object> body = buildRequestBody(model, systemPrompt, userPrompt, jsonMode, false);

        HttpHeaders headers = buildHeaders();
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

        try {
            String raw = groqRestTemplate.postForObject(
                GROQ_BASE_URL + "/chat/completions",
                request,
                String.class
            );
            return extractContent(raw);
        } catch (Exception ex) {
            log.error("Groq API error (model={}): {}", model, ex.getMessage());
            throw new GroqException("Groq API unavailable: " + ex.getMessage(), ex);
        }
    }

    /**
     * Appel chat/completions en mode streaming.
     * Retourne la réponse SSE brute (text/event-stream) sous forme de String.
     * Le contrôleur est responsable de piper les chunks vers le client.
     *
     * @return chaîne SSE complète (chaque data: {...} séparé par \n\n)
     */
    public String streamCompletion(String model, String systemPrompt, String userPrompt) {
        assertApiKeyPresent();

        Map<String, Object> body = buildRequestBody(model, systemPrompt, userPrompt, false, true);
        HttpHeaders headers = buildHeaders();
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

        try {
            return groqRestTemplate.postForObject(
                GROQ_BASE_URL + "/chat/completions",
                request,
                String.class
            );
        } catch (Exception ex) {
            log.error("Groq streaming error (model={}): {}", model, ex.getMessage());
            throw new GroqException("Groq streaming unavailable: " + ex.getMessage(), ex);
        }
    }

    /** Vrai si une clé Groq est configurée (sinon l'agent bascule en repli sans LLM). */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * Complétion brute avec messages libres + outils (tool calling, format OpenAI/Groq).
     * Retourne le message assistant (peut contenir {@code tool_calls}). Utilisé par l'agent
     * pour la boucle de raisonnement/outils du deep-path.
     */
    public JsonNode rawChat(String model,
                            List<Map<String, Object>> messages,
                            List<Map<String, Object>> tools) {
        assertApiKeyPresent();
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("model", model);
        body.put("messages", messages);
        body.put("max_tokens", 1024);
        body.put("temperature", 0.4);
        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools);
            body.put("tool_choice", "auto");
        }
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, buildHeaders());
        try {
            String raw = groqRestTemplate.postForObject(GROQ_BASE_URL + "/chat/completions", request, String.class);
            JsonNode root = objectMapper.readTree(raw);
            JsonNode choices = root.path("choices");
            if (choices.isEmpty()) throw new GroqException("Groq response contains no choices");
            return choices.get(0).path("message");
        } catch (GroqException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Groq rawChat error (model={}): {}", model, ex.getMessage());
            throw new GroqException("Groq unavailable: " + ex.getMessage(), ex);
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private void assertApiKeyPresent() {
        if (apiKey == null || apiKey.isBlank()) {
            throw new GroqException("GROQ_API_KEY non configurée — AI features désactivées");
        }
    }

    private HttpHeaders buildHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "Bearer " + apiKey);
        return headers;
    }

    private Map<String, Object> buildRequestBody(String model, String systemPrompt, String userPrompt,
                                                  boolean jsonMode, boolean stream) {
        List<Map<String, String>> messages = List.of(
            Map.of("role", "system", "content", systemPrompt),
            Map.of("role", "user",   "content", userPrompt)
        );

        if (jsonMode) {
            return Map.of(
                "model",           model,
                "messages",        messages,
                "max_tokens",      512,
                "temperature",     0.2,
                "stream",          false,
                "response_format", Map.of("type", "json_object")
            );
        }

        return Map.of(
            "model",       model,
            "messages",    messages,
            "max_tokens",  1024,
            "temperature", 0.7,
            "stream",      stream
        );
    }

    /**
     * Extrait le contenu texte depuis la réponse JSON OpenAI-compatible.
     * Structure : choices[0].message.content
     */
    private String extractContent(String rawJson) {
        try {
            JsonNode root    = objectMapper.readTree(rawJson);
            JsonNode choices = root.path("choices");
            if (choices.isEmpty()) {
                throw new GroqException("Groq response contains no choices");
            }
            return choices.get(0).path("message").path("content").asText();
        } catch (GroqException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new GroqException("Cannot parse Groq response: " + ex.getMessage(), ex);
        }
    }

    // -------------------------------------------------------------------------
    // Exception interne
    // -------------------------------------------------------------------------

    public static class GroqException extends RuntimeException {
        public GroqException(String message) {
            super(message);
        }
        public GroqException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
