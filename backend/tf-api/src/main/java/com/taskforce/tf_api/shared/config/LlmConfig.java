package com.taskforce.tf_api.shared.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import com.taskforce.tf_api.core.service.AiGatewayClient;
import com.taskforce.tf_api.core.service.LlmClient;

/**
 * Fournit le {@link LlmClient} actif : l'<b>AI Gateway</b> (service Python {@code ai-service} → Ollama
 * local). C'est le seul chemin LLM du produit.
 *
 * <p><b>Correctif {@code TF-AI-QUOTA-NOOP} — la branche {@code groq} est supprimée.</b> Ce bean
 * sélectionnait {@code GroqService} quand {@code ai.provider=groq}. Or {@code GroqService}
 * {@code implements LlmClient} <b>sans jamais override</b> {@code beginUsageCapture()} /
 * {@code currentUsage()} : il héritait des no-op de l'interface ({@code LlmUsage.ZERO}). Sous ce
 * provider, toute la chaîne de facturation devenait un no-op <b>silencieux</b> — {@code AiMeter} armait
 * la capture, {@code currentUsage()} rendait {@code ZERO}, {@code AiUsageService.record} sortait
 * immédiatement ({@code totalTokens() <= 0}), {@code assertWithinQuota} lisait toujours 0, et
 * <b>le quota ne se déclenchait plus sur aucun des 7 chemins</b>. Une seule variable d'environnement
 * désarmait la facturation IA, sans lever la moindre erreur.</p>
 *
 * <p><b>Pourquoi supprimer la branche plutôt qu'implémenter la capture</b> : Groq n'est pas utilisé et
 * ne peut pas l'être — <b>bloqué sur ce réseau</b> (403 ; décision du 07/07 : Ollama local, Anthropic et
 * OpenAI écartés car payants). Implémenter la capture aurait entretenu du code mort <i>et</i> laissé la
 * mine armée. Le provider n'étant plus lu, un {@code AI_PROVIDER=groq} résiduel devient <b>sans effet</b>
 * au lieu d'être dangereux.</p>
 *
 * <p><b>Ceci ne ferme pas la voie d'un LLM hébergé en production</b> : ce chemin passe par
 * {@code ai-service} (proxy sur une API OpenAI-compatible via {@code OLLAMA_BASE_URL}), donc par
 * {@link AiGatewayClient} — jamais par {@code GroqService}. Les deux clients sont distincts :
 * {@code GroqService} tape {@code https://api.groq.com} en direct, l'AI Gateway tape le service Python.</p>
 *
 * <p>Nettoyage restant, tracé en {@code TF-AI-GROQ-CLEANUP} : supprimer {@code GroqService},
 * {@code AssistantService} (mort — aucun contrôleur ne l'injecte) et leurs tests ; renommer
 * {@code ai.groq.assistant-model}, lu par 8 services alors que l'AI Gateway <b>ignore</b> le modèle
 * qu'on lui passe — on lit « llama-3.3-70b » dans le code pendant que Qwen répond.</p>
 */
@Configuration
public class LlmConfig {

    @Bean
    @Primary
    public LlmClient llmClient(AiGatewayClient gateway) {
        return gateway;
    }
}
