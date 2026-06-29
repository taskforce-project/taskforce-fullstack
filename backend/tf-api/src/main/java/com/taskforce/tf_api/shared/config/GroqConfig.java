package com.taskforce.tf_api.shared.config;

import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.web.client.RestTemplate;

/**
 * Configuration du client HTTP pour l'API Groq (LLM cloud).
 * Timeout dédié plus long que le RestTemplate générique car les appels LLM
 * peuvent prendre jusqu'à 15-20 secondes pour les modèles 70B.
 */
@Configuration
public class GroqConfig {

    @Value("${ai.groq.api-key:}")
    private String apiKey;

    @Value("${ai.groq.smart-assign-model:llama-3.1-8b-instant}")
    private String smartAssignModel;

    @Value("${ai.groq.assistant-model:llama-3.3-70b-versatile}")
    private String assistantModel;

    @Bean(name = "groqRestTemplate")
    public RestTemplate groqRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(30_000); // 30s — modèles 70B peuvent être lents
        RestTemplate rt = new RestTemplate();
        rt.setRequestFactory(factory);
        // Groq renvoie de l'UTF-8 mais souvent sans charset explicite → le StringHttpMessageConverter
        // par défaut décode en ISO-8859-1 et casse les accents (é→Ã©). On force l'UTF-8.
        rt.getMessageConverters().removeIf(c -> c instanceof StringHttpMessageConverter);
        rt.getMessageConverters().add(0, new StringHttpMessageConverter(StandardCharsets.UTF_8));
        return rt;
    }

    @Bean
    public String groqApiKey() {
        return apiKey;
    }

    @Bean
    public String groqSmartAssignModel() {
        return smartAssignModel;
    }

    @Bean
    public String groqAssistantModel() {
        return assistantModel;
    }
}
