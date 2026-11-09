package com.taskforce.tf_api.core.service;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;
import com.taskforce.tf_api.core.service.ai.ChosenModel;
import com.taskforce.tf_api.core.service.ai.ContextBudget;
import com.taskforce.tf_api.core.service.ai.ModelChoice;
import com.taskforce.tf_api.core.service.ai.ModelGateway;
import com.taskforce.tf_api.core.service.ai.ModelProviderException;
import com.taskforce.tf_api.core.service.ai.ModelWindow;
import com.taskforce.tf_api.core.service.ai.TurnStop;
import com.taskforce.tf_api.core.service.ai.TurnStoppedException;
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
    /** Le prompt du dernier appel et sa fenêtre, pendant une capture : la jauge de contexte, pas une somme. */
    private final ThreadLocal<LlmContext> lastContext = new ThreadLocal<>();

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
        lastContext.remove();
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
        lastContext.remove();
    }

    @Override
    public String currentModel() {
        return lastModel.get();
    }

    @Override
    public LlmContext currentContext() {
        return lastContext.get();
    }

    /**
     * Garde le modèle qui a répondu, son prompt et sa fenêtre, pendant une capture seulement : hors capture, rien ne les
     * lira.
     */
    private void remember(ModelGateway.ChatReply reply) {
        if (usageAccumulator.get() == null) return;
        if (reply.model() != null && !reply.model().isBlank()) lastModel.set(reply.model());
        long prompt = reply.usage() == null ? 0 : reply.usage().promptTokens();
        lastContext.set(new LlmContext(prompt, reply.contextWindow(), reply.windowEstimated()));
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

    @Override
    public ModelWindow contextWindow(String tier) {
        AiStatusService.Snapshot snapshot = status.snapshot();
        return gateway.window(snapshot.settings(), modelOf(tier, snapshot.status()), "deep".equals(tier));
    }

    @Override
    public Optional<ModelWindow> largerWindow(String tier, int tokens) {
        AiStatusService.Snapshot snapshot = status.snapshot();
        String current = modelOf(tier, snapshot.status());
        boolean think = "deep".equals(tier);
        return ModelChoice.chatModels(snapshot.settings().provider(), snapshot.models()).stream()
            .filter(model -> !model.equals(current))
            .map(model -> gateway.window(snapshot.settings(), model, think))
            .filter(window -> !window.estimated() && new ContextBudget(window, tokens, 0, 0, 0).fits())
            .filter(window -> gateway.describe(snapshot.settings(), window.model())
                .map(card -> !Boolean.FALSE.equals(card.tools())).orElse(true))
            .min(Comparator.comparingInt(ModelWindow::tokens));
    }

    /** Le modèle de ce palier : celui que la personne a choisi pour cette action (R113, R118), sinon celui du palier. */
    private static String modelOf(String tier, AiStatus current) {
        return ChosenModel.current().orElseGet(() -> "fast".equals(tier) ? current.fastModel() : current.chatModel());
    }

    private JsonNode callChat(List<?> messages, List<Map<String, Object>> tools, boolean jsonMode, String tier,
                              String model) {
        // La personne a arrêté ce tour (R134) : rien ne part.
        TurnStop.check();
        AiStatusService.Snapshot snapshot = status.snapshot();
        AiStatus current = snapshot.status();
        if (!current.chatAvailable()) {
            throw new LlmException("AI is not available on this instance", null);
        }
        // Le modèle nommé d'abord (rejeu de la banque, R61), puis celui que la personne a choisi pour cette action
        // (R113, R118), sinon celui du palier.
        String chosen = model != null && !model.isBlank() ? model : modelOf(tier, current);
        boolean think = "deep".equals(tier);
        try {
            ModelGateway.ChatReply reply = gateway.chat(snapshot.settings(),
                new ModelGateway.ChatCall(messages, tools, jsonMode, chosen, think));
            accumulateUsage(reply.usage());
            remember(reply);
            return reply.message();
        } catch (TurnStoppedException stopped) {
            // L'appel coupé n'a pas dit son usage : le prompt que le modèle a commencé à lire compte quand même, estimé
            // comme le budget de la requête. Ce n'est pas une panne : l'état de l'IA reste valable.
            long read = ContextBudget.tokens(String.valueOf(messages));
            accumulateUsage(new LlmUsage(read, 0, read));
            throw stopped;
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
