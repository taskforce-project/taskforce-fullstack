package com.taskforce.tf_api.shared.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import com.taskforce.tf_api.core.service.AiGatewayClient;
import com.taskforce.tf_api.core.service.GroqService;
import com.taskforce.tf_api.core.service.LlmClient;

/**
 * Sélectionne le {@link LlmClient} actif selon {@code ai.provider} :
 * {@code ollama} (défaut, local gratuit via l'AI Gateway) ou {@code groq} (cloud, bloqué sur ce réseau).
 */
@Configuration
public class LlmConfig {

    @Bean
    @Primary
    public LlmClient llmClient(@Value("${ai.provider:ollama}") String provider,
                               GroqService groq, AiGatewayClient gateway) {
        return "groq".equalsIgnoreCase(provider) ? groq : gateway;
    }
}
