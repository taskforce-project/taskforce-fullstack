package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Contract test (wire) — {@link GroqService} contre l'API Groq (compatible OpenAI).
 *
 * <p>{@link MockRestServiceServer} lié au {@code RestTemplate} injecté : valide la <b>vraie requête HTTP</b>
 * (URL {@code /chat/completions}, POST, header {@code Authorization: Bearer <key>}, corps JSON
 * {@code {model, messages:[...]}}) et le parsing de la réponse {@code choices[0].message.content}.</p>
 */
@DisplayName("GroqService (contract wire API Groq)")
class GroqServiceContractTest {

    private static final String CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

    private GroqService service;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        RestTemplate rt = new RestTemplate();
        service = new GroqService(rt, new ObjectMapper());
        ReflectionTestUtils.setField(service, "apiKey", "test-key");
        server = MockRestServiceServer.createServer(rt);
    }

    @Test
    @DisplayName("chatCompletion : POST /chat/completions avec Bearer + corps JSON, parse le contenu")
    void chatCompletion_poste_le_bon_wire_et_parse_le_contenu() {
        server.expect(requestTo(CHAT_URL))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("Authorization", "Bearer test-key"))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.model").value("llama-3.3-70b"))
            .andExpect(jsonPath("$.messages[0].role").value("system"))
            .andExpect(jsonPath("$.messages[1].role").value("user"))
            .andRespond(withSuccess(
                "{\"choices\":[{\"message\":{\"content\":\"Réponse\"}}]}",
                MediaType.APPLICATION_JSON));

        String content = service.chatCompletion("llama-3.3-70b", "tu es un assistant", "salut", false);

        assertThat(content).isEqualTo("Réponse");
        server.verify();
    }

    @Test
    @DisplayName("isConfigured : true si une clé est présente")
    void isConfigured_vrai_quand_cle_presente() {
        assertThat(service.isConfigured()).isTrue();
    }

    @Test
    @DisplayName("isConfigured : false si la clé est vide")
    void isConfigured_faux_quand_cle_absente() {
        ReflectionTestUtils.setField(service, "apiKey", "");
        assertThat(service.isConfigured()).isFalse();
    }

    @Test
    @DisplayName("erreur serveur Groq (500) → GroqException (repli non silencieux)")
    void erreur_serveur_leve_groq_exception() {
        server.expect(requestTo(CHAT_URL))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withServerError());

        assertThatThrownBy(() -> service.chatCompletion("m", "s", "u", false))
            .isInstanceOf(GroqService.GroqException.class);
        server.verify();
    }
}
