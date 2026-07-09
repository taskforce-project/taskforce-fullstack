package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantSource;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantStep;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantToolCall;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Cœur agentique de l'assistant. Boucle : router (fast/deep) → retrieval Brain OS (RAG) →
 * raisonnement + outils (tool-calling) → write-back → réponse structurée {@link AssistantAnswer}.
 *
 * <p><b>Sans clé LLM</b> (cas actuel : Groq bloqué) la génération est inactive mais le RAG est réel :
 * on renvoie les sources Brain OS trouvées + une réponse de repli. Dès qu'une clé est présente, la
 * boucle de tool-calling devient vivante (raisonnement, recherche, création de notes).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AgentService {

    private final BrainAccessGuard   access;
    private final BrainSearchService search;
    private final AgentToolRegistry  tools;
    private final LlmClient          llm;
    private final ObjectMapper       objectMapper;

    // Nom de modèle passé au client LLM. Ignoré par l'AI Gateway (qui impose son modèle Ollama) ;
    // utilisé seulement si provider=groq.
    @Value("${ai.groq.assistant-model:llama-3.3-70b-versatile}")
    private String model;

    private static final int MAX_TOOL_ITERS = 5;

    @Transactional
    public AssistantAnswer run(String slug, Long userId, String message) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        AgentContext ctx = new AgentContext(slug, ws.getId(), userId);

        boolean deep = isDeepIntent(message);

        // ── Retrieval (RAG) — réel, avec ou sans LLM ─────────────────────────
        List<KnowledgeNode> hits = search.retrieveRelevant(ws.getId(), message, 5);
        List<AssistantSource> sources = hits.stream()
            .map(n -> new AssistantSource(n.getTitle(), n.getDomain().name(), null))
            .toList();

        List<AssistantStep> steps = new ArrayList<>();
        steps.add(new AssistantStep("Compréhension de la demande", "done"));
        steps.add(new AssistantStep("Recherche dans le Brain OS (" + hits.size() + " note(s))", "done"));

        // ── Sans LLM : repli gracieux (sources réelles) ──────────────────────
        if (!llm.isConfigured()) {
            steps.add(new AssistantStep("Génération (LLM requis)", "pending"));
            return new AssistantAnswer(fallbackAnswer(message, hits), null, "fallback",
                sources, steps, List.of());
        }

        // ── Avec LLM : raisonnement + outils (deep) ou réponse directe (fast) ─
        try {
            steps.add(new AssistantStep(deep ? "Raisonnement + outils" : "Rédaction", "active"));
            List<AssistantToolCall> toolCalls = new ArrayList<>();
            String answer = deep ? runToolLoop(message, hits, ctx, toolCalls)
                                 : runDirect(message, hits);
            steps.set(steps.size() - 1, new AssistantStep(deep ? "Raisonnement + outils" : "Rédaction", "done"));
            return new AssistantAnswer(answer, null, deep ? "deep" : "fast", sources, steps, toolCalls);
        } catch (Exception ex) {
            log.warn("Agent LLM indisponible (slug={}): {}", slug, ex.getMessage());
            steps.set(steps.size() - 1, new AssistantStep("Génération", "error"));
            return new AssistantAnswer(fallbackAnswer(message, hits), null, "fallback", sources, steps, List.of());
        }
    }

    // -------------------------------------------------------------------------
    // Deep path — boucle de tool-calling (active seulement si une clé est présente)
    // -------------------------------------------------------------------------

    private String runToolLoop(String message, List<KnowledgeNode> hits,
                               AgentContext ctx, List<AssistantToolCall> toolCalls) {
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt(hits, true)));
        messages.add(Map.of("role", "user", "content", message));
        List<Map<String, Object>> toolDefs = tools.toolDefinitions();

        for (int i = 0; i < MAX_TOOL_ITERS; i++) {
            // Tier "fast" (8B) par défaut sur ce hardware (14B trop lent/erratique) ; réactif.
            JsonNode msg = llm.rawChat(model, messages, toolDefs, "fast");
            JsonNode calls = msg.path("tool_calls");
            if (calls.isArray() && !calls.isEmpty()) {
                messages.add(objectMapper.convertValue(msg, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {}));
                for (JsonNode call : calls) {
                    String id = call.path("id").asText();
                    String name = call.path("function").path("name").asText();
                    String argsJson = call.path("function").path("arguments").asText("{}");
                    String result;
                    String status = "success";
                    try {
                        AgentTool tool = tools.get(name);
                        if (tool == null) { result = "Outil inconnu: " + name; status = "error"; }
                        else {
                            Map<String, Object> args = objectMapper.readValue(argsJson, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
                            result = tool.execute(args, ctx);
                        }
                    } catch (Exception e) {
                        result = "Échec de l'outil " + name + " : " + e.getMessage();
                        status = "error";
                    }
                    toolCalls.add(new AssistantToolCall(name, status, argsJson, result));
                    messages.add(Map.of("role", "tool", "tool_call_id", id, "content", result));
                }
                continue; // relancer le modèle avec les résultats d'outils
            }
            return msg.path("content").asText("");
        }
        return "Réponse interrompue (trop d'étapes d'outils).";
    }

    private String runDirect(String message, List<KnowledgeNode> hits) {
        // Tier "fast" : petit modèle 8B pour les réponses simples/interactives (rapide).
        return llm.chatCompletion(model, systemPrompt(hits, false), message, false, "fast");
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** Heuristique de routing : action/décision/analyse → deep ; sinon fast. */
    private boolean isDeepIntent(String message) {
        String m = message == null ? "" : message.toLowerCase();
        return m.matches(".*\\b(cr[ée]e|ajoute|d[ée]cide|d[ée]cision|plan|planifie|analyse|compare|"
            + "recherche|enqu[êe]te|propose|r[ée]dige|note|archive|met[s]? à jour|strat[ée]gie).*");
    }

    private String systemPrompt(List<KnowledgeNode> hits, boolean withTools) {
        StringBuilder sb = new StringBuilder();
        sb.append("Tu es Taskforce AI, le copilote du workspace. Réponds dans la langue de l'utilisateur, ")
          .append("de façon concise et fondée sur le contexte réel. ");
        if (withTools) {
            sb.append("Tu peux utiliser des outils : recherche dans la mémoire (search_brain) et création ")
              .append("de notes (create_note). Suis les règles AGENTS : bon domaine + type, [[liens]] et #tags. ");
        }
        if (!hits.isEmpty()) {
            sb.append("\n\nContexte (Brain OS) :\n");
            for (KnowledgeNode n : hits) {
                String c = n.getContent() != null ? n.getContent() : "";
                if (c.length() > 400) c = c.substring(0, 400) + "…";
                sb.append("- [").append(n.getDomain()).append("] ").append(n.getTitle())
                  .append(" : ").append(c.replace("\n", " ")).append("\n");
            }
        }
        return sb.toString();
    }

    /** Réponse sans LLM : expose le RAG (sources réelles) + invite à configurer la clé. */
    private String fallbackAnswer(String message, List<KnowledgeNode> hits) {
        StringBuilder sb = new StringBuilder();
        if (hits.isEmpty()) {
            sb.append("Je n'ai pas trouvé de note pertinente dans le Brain OS pour cette demande.");
        } else {
            sb.append("Voici les notes les plus pertinentes de votre **Brain OS** :\n\n");
            for (KnowledgeNode n : hits) {
                sb.append("- [[").append(n.getTitle()).append("]] — *").append(n.getDomain()).append("*\n");
            }
        }
        sb.append("\n\n> [!note] Génération désactivée\n")
          .append("> Activez un LLM (Ollama local via l'AI Gateway) pour les réponses génératives, le ")
          .append("raisonnement et les actions (recherche + écriture dans le cerveau).");
        return sb.toString();
    }
}
