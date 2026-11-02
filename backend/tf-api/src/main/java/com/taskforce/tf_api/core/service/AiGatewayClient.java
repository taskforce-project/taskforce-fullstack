package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;
import com.taskforce.tf_api.core.service.ai.ModelGateway;
import com.taskforce.tf_api.core.service.ai.ModelProviderException;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.extern.slf4j.Slf4j;

/**
 * {@link LlmClient} par la passerelle de modèles du backend ({@link ModelGateway}) : Ollama, toute API compatible
 * OpenAI ou l'API d'Anthropic, selon les réglages de l'instance (ou de l'app desktop). Le palier choisit le modèle :
 * {@code fast} le modèle rapide, {@code deep} le modèle principal qui raisonne, sinon le modèle principal.
 *
 * <p>Quand l'IA n'est pas disponible ({@link AiStatusService}), l'appel échoue tout de suite au lieu d'attendre le
 * délai de lecture : les appelants passent à leur repli sans bloquer la requête.</p>
 */
@Service
@Slf4j
public class AiGatewayClient implements LlmClient {

    private final ModelGateway gateway;
    private final AiStatusService status;

    /** Accumulateur d'usage par thread : [prompt, completion, total]. {@code null} = capture inactive. */
    private final ThreadLocal<long[]> usageAccumulator = new ThreadLocal<>();
    private final ThreadLocal<String> lastModel = new ThreadLocal<>();

    public AiGatewayClient(ModelGateway gateway, AiStatusService status) {
        this.gateway = gateway;
        this.status = status;
    }

    @Override
    public boolean isConfigured() {
        return status.current().chatAvailable();
    }

    // ── Capture d'usage (tokens) — cf. LlmClient ─────────────────────────────

    @Override
    public void beginUsageCapture() {
        usageAccumulator.set(new long[3]);
        lastModel.remove();
    }

    @Override
    public LlmUsage currentUsage() {
        long[] a = usageAccumulator.get();
        return a == null ? LlmUsage.ZERO : new LlmUsage(a[0], a[1], a[2]);
    }

    @Override
    public void endUsageCapture() {
        usageAccumulator.remove();
        lastModel.remove();
    }

    @Override
    public String currentModel() {
        return lastModel.get();
    }

    /** Garde le modèle qui a répondu, pendant une capture seulement : hors capture, rien ne le lira. */
    private void rememberModel(String model) {
        if (usageAccumulator.get() != null && model != null && !model.isBlank()) {
            lastModel.set(model);
        }
    }

    @Override
    public String chatCompletion(String systemPrompt, String userPrompt, boolean jsonMode, String tier) {
        JsonNode message = callChat(
            List.of(Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user",   "content", userPrompt)),
            null, jsonMode, tier, null);
        return message.path("content").asText("");
    }

    @Override
    public JsonNode rawChat(List<Map<String, Object>> messages, List<Map<String, Object>> tools, String tier) {
        return callChat(messages, tools, false, tier, null);
    }

    @Override
    public JsonNode rawChatWithModel(List<Map<String, Object>> messages, List<Map<String, Object>> tools, String model) {
        return callChat(messages, tools, false, null, model);
    }

    private JsonNode callChat(List<?> messages, List<Map<String, Object>> tools, boolean jsonMode, String tier,
                              String model) {
        AiStatusService.Snapshot snapshot = status.snapshot();
        AiStatus current = snapshot.status();
        if (!current.chatAvailable()) {
            throw new LlmException("AI is not available on this instance", null);
        }
        // Le palier choisit le modèle ; sans palier, le modèle nommé (rejeu de la banque, R61), sinon le principal.
        String chosen = tier != null
            ? ("fast".equals(tier) ? current.fastModel() : current.chatModel())
            : (model != null && !model.isBlank() ? model : current.chatModel());
        boolean think = "deep".equals(tier);
        try {
            ModelGateway.ChatReply reply = gateway.chat(snapshot.settings(),
                new ModelGateway.ChatCall(messages, tools, jsonMode, chosen, think));
            accumulateUsage(reply.usage());
            rememberModel(reply.model());
            return reply.message();
        } catch (ModelProviderException.ToolsRefused refused) { // le fournisseur répond : son état reste valable
            log.error("AI provider refused the tools: {}", LogSafe.of(refused.getMessage()));
            throw new LlmToolsRefusedException("The AI provider refused the tools", refused);
        } catch (RuntimeException ex) {
            log.error("AI provider call failed: {}", LogSafe.of(ex.getMessage()));
            status.invalidate(); // le fournisseur est peut-être tombé : on relira son état au prochain appel
            throw new LlmException("AI service unavailable: " + ex.getMessage(), ex);
        }
    }

    /** Additionne l'usage d'une réponse à l'accumulateur du thread (si la capture est active). */
    private void accumulateUsage(LlmUsage usage) {
        long[] acc = usageAccumulator.get();
        if (acc == null || usage == null) {
            return;
        }
        acc[0] += usage.promptTokens();
        acc[1] += usage.completionTokens();
        acc[2] += usage.totalTokens();
    }

    public static class LlmException extends RuntimeException {
        public LlmException(String message, Throwable cause) { super(message, cause); }
    }
}
