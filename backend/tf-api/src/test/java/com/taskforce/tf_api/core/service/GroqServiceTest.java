package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link GroqService} (client LLM). {@code RestTemplate} mocké, {@code ObjectMapper} réel.
 * Couvre chatCompletion (succès/erreur), rawChat, isConfigured, garde-fou clé API absente.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("GroqService")
class GroqServiceTest {

    @Mock private RestTemplate groqRestTemplate;

    private GroqService service;

    @BeforeEach
    void setUp() {
        service = new GroqService(groqRestTemplate, new ObjectMapper());
        ReflectionTestUtils.setField(service, "apiKey", "gsk_test_key");
    }

    private static final String OK_JSON =
        "{\"choices\":[{\"message\":{\"content\":\"Bonjour !\"}}]}";

    @Test
    @DisplayName("chatCompletion renvoie le contenu du message assistant")
    void chatCompletion_returns_content() {
        when(groqRestTemplate.postForObject(anyString(), any(), eq(String.class))).thenReturn(OK_JSON);

        String res = service.chatCompletion("llama", "sys", "user", true);

        assertThat(res).contains("Bonjour");
    }

    @Test
    @DisplayName("chatCompletion propage une erreur API en exception")
    void chatCompletion_api_error() {
        when(groqRestTemplate.postForObject(anyString(), any(), eq(String.class)))
            .thenThrow(new RuntimeException("503"));

        assertThatThrownBy(() -> service.chatCompletion("llama", "sys", "user", false))
            .isInstanceOf(RuntimeException.class);
    }

    @Test
    @DisplayName("rawChat renvoie le message assistant (choices[0].message)")
    void rawChat_returns_message() {
        when(groqRestTemplate.postForObject(anyString(), any(), eq(String.class))).thenReturn(OK_JSON);

        JsonNode msg = service.rawChat("llama", List.of(Map.of("role", "user", "content", "hi")), List.of());

        assertThat(msg.path("content").asText()).contains("Bonjour");
    }

    @Test
    @DisplayName("isConfigured reflète la présence de la clé API")
    void isConfigured_reflects_key() {
        assertThat(service.isConfigured()).isTrue();
        ReflectionTestUtils.setField(service, "apiKey", "");
        assertThat(service.isConfigured()).isFalse();
    }

    @Test
    @DisplayName("sans clé API, chatCompletion lève une exception")
    void no_api_key_throws() {
        ReflectionTestUtils.setField(service, "apiKey", "");

        assertThatThrownBy(() -> service.chatCompletion("llama", "sys", "user", false))
            .isInstanceOf(RuntimeException.class);
    }
}
