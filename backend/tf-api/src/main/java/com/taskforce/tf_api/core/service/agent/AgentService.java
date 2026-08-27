package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantSource;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantStep;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantToolCall;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantUsage;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.core.service.mcp.ExternalMcpTool;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;

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

    private final BrainAccessGuard    access;
    private final BrainSearchService  search;
    private final AgentToolRegistry   tools;
    private final LlmClient           llm;
    private final ObjectMapper        objectMapper;
    private final AiUsageService      aiUsageService;
    private final WorkspaceMcpService workspaceMcp;

    // Nom de modèle passé au client LLM. Ignoré par l'AI Gateway (qui impose son modèle Ollama) ;
    // utilisé seulement si provider=groq.
    @Value("${ai.model.assistant:gateway-default}")
    private String model;

    // Sûreté MCP : les écritures externes sont PROPOSÉES (validation humaine), pas exécutées par l'agent.
    @Value("${integrations.mcp.confirm-writes:true}")
    private boolean confirmExternalWrites;

    // Tier LLM des tours avec outils externes MCP. Défaut "fast" (8B) ; bumpable ("standard"/"deep")
    // pour plus de fiabilité multi-outils si le hardware suit.
    @Value("${integrations.mcp.tool-tier:fast}")
    private String mcpToolTier;

    private static final int MAX_TOOL_ITERS = 5;

    public AssistantAnswer run(String slug, Long userId, String message) {
        return run(slug, userId, message, List.of());
    }

    /**
     * Variante avec <b>mémoire multi-tours</b> : {@code history} = messages précédents de la
     * conversation (format LLM {@code {role, content}}, ordre chronologique), injectés dans le
     * prompt avant le message courant. Vide = premier tour (comportement identique à l'ancien).
     *
     * <p><b>PC-022 — aucune transaction n'englobe la boucle LLM.</b> Cette méthode était
     * {@code @Transactional} : elle gardait une connexion Hikari ouverte pendant TOUS les appels au
     * modèle (jusqu'à {@code MAX_TOOL_ITERS} × 300 s de read-timeout) → ~20 chats Cortex simultanés
     * épuisaient le pool (20) et faisaient tomber toute l'API. On suit le patron d'{@link AnalysisJobRunner} :
     * l'orchestrateur ne tient <b>aucune</b> tx ; chaque accès DB est confié à un collaborateur
     * {@code @Transactional} (BrainAccessGuard, BrainSearchService, KnowledgeService via les outils,
     * AiUsageService) → une tx courte par opération, jamais tenue pendant l'appel au LLM.</p>
     */
    public AssistantAnswer run(String slug, Long userId, String message, List<Map<String, Object>> history) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        AgentContext ctx = new AgentContext(slug, ws.getId(), userId);
        List<Map<String, Object>> hist = history == null ? List.of() : history;

        // ── Intention : small-talk / salutation → réponse directe SANS recherche Brain OS ni sources.
        //    (Les étapes reflètent le chemin RÉEL : pas d'étape « Recherche Brain OS » pour un simple bonjour.)
        if (isConversational(message)) {
            return runConversational(ws.getId(), message, hist);
        }

        boolean deep = isDeepIntent(message);

        // ── Retrieval (RAG) — réel, avec ou sans LLM ─────────────────────────
        List<KnowledgeNode> hits = search.retrieveRelevant(ws.getId(), message, 5);
        List<AssistantSource> sources = hits.stream()
            .map(n -> new AssistantSource(n.getTitle(), n.getDomain().name(), null))
            .toList();

        // Étapes de réflexion enrichies (label + détail) — rendues animées côté front.
        List<AssistantStep> steps = new ArrayList<>();
        steps.add(new AssistantStep("Compréhension de la demande", "done",
            deep ? "Analyse approfondie — raisonnement + outils" : "Réponse directe — mode rapide"));

        String domains = hits.stream().map(n -> n.getDomain().name()).distinct()
            .collect(java.util.stream.Collectors.joining(" · "));
        steps.add(new AssistantStep("Recherche dans le Brain OS", "done",
            hits.isEmpty() ? "Aucune note pertinente trouvée" : hits.size() + " note(s) · " + domains));

        // ── Sans LLM : repli gracieux (sources réelles) ──────────────────────
        if (!llm.isConfigured()) {
            steps.add(new AssistantStep("Génération", "pending", "Activez un LLM (Ollama) pour les réponses génératives"));
            return new AssistantAnswer(fallbackAnswer(message, hits), null, "fallback",
                sources, steps, List.of(), AssistantUsage.NONE);
        }

        // ── Avec LLM : raisonnement + outils (deep) ou réponse directe (fast) ─
        // Quota IA mensuel du compte : bloque (409 upsell) si le plafond de tokens du plan est atteint.
        aiUsageService.assertWithinQuota(ws.getId());

        // On arme la capture d'usage : chaque appel LLM (jusqu'à 5 en boucle deep) additionne ses tokens.
        String genLabel = deep ? "Raisonnement + outils" : "Rédaction de la réponse";
        llm.beginUsageCapture();
        try {
            steps.add(new AssistantStep(genLabel, "active",
                deep ? "Sélection et appel des outils du Brain OS" : "Génération via Cortex (rapide)"));
            List<AssistantToolCall> toolCalls = new ArrayList<>();
            String answer = deep ? runToolLoop(message, hits, ctx, toolCalls, hist)
                                 : runDirect(message, hits, hist);
            steps.set(steps.size() - 1, new AssistantStep(genLabel, "done", genDoneDescription(deep, toolCalls)));
            LlmUsage usage = llm.currentUsage();
            recordUsage(ws.getId(), usage);
            return new AssistantAnswer(answer, null, deep ? "deep" : "fast", sources, steps, toolCalls, toUsage(usage));
        } catch (Exception ex) {
            log.warn("Agent LLM indisponible (slug={}): {}", slug, ex.getMessage());
            steps.set(steps.size() - 1, new AssistantStep(genLabel, "error", "Le LLM n'a pas répondu — repli sur les sources du Brain OS"));
            // usage partiel réel (les appels avant l'échec ont pu consommer des tokens)
            LlmUsage usage = llm.currentUsage();
            recordUsage(ws.getId(), usage);
            return new AssistantAnswer(fallbackAnswer(message, hits), null, "fallback", sources, steps, List.of(), toUsage(usage));
        } finally {
            llm.endUsageCapture();
        }
    }

    /** Détail de l'étape de génération une fois terminée (outils mobilisés en mode deep). */
    private static String genDoneDescription(boolean deep, List<AssistantToolCall> toolCalls) {
        if (!deep) return "Réponse générée par Cortex";
        String used = toolCalls.stream().map(AssistantToolCall::name).distinct()
            .collect(java.util.stream.Collectors.joining(", "));
        return used.isEmpty() ? "Réponse directe (aucun outil nécessaire)" : "Outils : " + used;
    }

    private static AssistantUsage toUsage(LlmUsage u) {
        // Le client réel renvoie toujours LlmUsage.ZERO (jamais null) ; garde défensive pour les providers/mocks.
        if (u == null) return AssistantUsage.NONE;
        return new AssistantUsage(u.promptTokens(), u.completionTokens(), u.totalTokens());
    }

    /** Enregistre la conso IA (best-effort : ne casse jamais la réponse de l'agent). */
    private void recordUsage(Long workspaceId, LlmUsage usage) {
        try {
            aiUsageService.record(workspaceId, usage);
        } catch (Exception e) {
            log.warn("Suivi conso IA KO (ws={}) : {}", workspaceId, e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Intention conversationnelle (small-talk) — réponse directe, sans RAG ni sources
    // -------------------------------------------------------------------------

    private static final String CONVERSATIONAL_PROMPT =
        "Tu es Cortex, le copilote IA du workspace TaskForce. Réponds brièvement, naturellement et "
        + "chaleureusement à ce message conversationnel (salutation, remerciement, small-talk). "
        + "Ne cite AUCUNE source et n'invente pas de contexte projet. 1 à 2 phrases maximum.";

    private static final java.util.Set<String> SMALLTALK = java.util.Set.of(
        "bonjour", "salut", "hello", "hey", "coucou", "yo", "hi", "bonsoir", "re", "wesh",
        "merci", "merci beaucoup", "thanks", "thx", "ok", "okay", "d'accord", "oui", "non",
        "yes", "no", "super", "cool", "genial", "génial", "parfait", "top", "nickel", "bien",
        "bye", "au revoir", "a bientot", "à bientôt", "bonne journee", "bonne journée",
        "bonne soiree", "bonne soirée", "ca va", "ça va", "comment ca va", "comment ça va",
        "comment vas tu", "comment vas-tu", "comment va tu", "comment allez vous",
        "comment allez-vous", "tu vas bien", "vous allez bien", "tout va bien", "quoi de neuf"
    );

    /** Salutation / small-talk pur → pas de recherche. On retire une salutation de tête éventuelle, puis on compare. */
    private boolean isConversational(String message) {
        if (message == null) return false;
        String m = message.trim().toLowerCase()
            .replaceAll("[!?.,;:]+$", "").trim()
            .replaceAll("\\s+", " ");
        if (m.isEmpty() || m.length() > 40) return false;
        if (SMALLTALK.contains(m)) return true;
        String core = m.replaceFirst("^(bonjour|salut|hello|hey|coucou|bonsoir|yo|hi|wesh|re)\\b[\\s,!]*", "").trim();
        return core.isEmpty() || SMALLTALK.contains(core);
    }

    /** Réponse à un message conversationnel : 2 étapes réelles (comprendre → rédiger), sans RAG ni sources. */
    private AssistantAnswer runConversational(Long workspaceId, String message, List<Map<String, Object>> history) {
        List<AssistantStep> steps = new ArrayList<>();
        steps.add(new AssistantStep("Compréhension de la demande", "done",
            "Conversation générale — réponse directe (pas de recherche nécessaire)"));

        if (!llm.isConfigured()) {
            steps.add(new AssistantStep("Génération", "pending", "Activez un LLM (Ollama) pour les réponses génératives"));
            return new AssistantAnswer(smallTalkFallback(), null, "fallback", List.of(), steps, List.of(), AssistantUsage.NONE);
        }

        // Même gate de quota que le chemin principal (run) : le small-talk consomme aussi des tokens.
        // Sans ce gate, un compte au plafond contournait le quota en enchaînant « salut »/« merci ».
        // Au-dessus du plafond → 409 (repli côté front), avant tout appel LLM.
        aiUsageService.assertWithinQuota(workspaceId);

        llm.beginUsageCapture();
        try {
            steps.add(new AssistantStep("Rédaction de la réponse", "active", "Génération via Cortex (rapide)"));
            String answer = llm.chat(model, withHistory(CONVERSATIONAL_PROMPT, history, message), "fast");
            steps.set(steps.size() - 1, new AssistantStep("Rédaction de la réponse", "done", "Réponse générée par Cortex"));
            LlmUsage usage = llm.currentUsage();
            recordUsage(workspaceId, usage);
            return new AssistantAnswer(answer, null, "fast", List.of(), steps, List.of(), toUsage(usage));
        } catch (Exception ex) {
            log.warn("Cortex (conversation) indisponible : {}", ex.getMessage());
            steps.set(steps.size() - 1, new AssistantStep("Rédaction de la réponse", "error", "Le LLM n'a pas répondu"));
            LlmUsage usage = llm.currentUsage();
            recordUsage(workspaceId, usage);
            return new AssistantAnswer(smallTalkFallback(), null, "fallback", List.of(), steps, List.of(), toUsage(usage));
        } finally {
            llm.endUsageCapture();
        }
    }

    private static String smallTalkFallback() {
        return "Bonjour ! Je suis **Cortex**, le copilote IA de votre workspace. Posez-moi une question sur "
            + "vos projets, décisions ou docs et j'irai chercher dans le Brain OS.";
    }

    // -------------------------------------------------------------------------
    // Deep path — boucle de tool-calling (active seulement si une clé est présente)
    // -------------------------------------------------------------------------

    private String runToolLoop(String message, List<KnowledgeNode> hits,
                               AgentContext ctx, List<AssistantToolCall> toolCalls,
                               List<Map<String, Object>> history) {
        // Outils externes (serveurs MCP connectés sur le workspace) — découverts par requête, cachés.
        List<AgentTool> external = workspaceMcp.toolsFor(ctx);
        if (!external.isEmpty()) {
            log.info("Cortex deep (ws={}) : {} outil(s) interne(s) + {} externe(s) MCP {}",
                ctx.workspaceId(), tools.all().size(), external.size(),
                external.stream().map(AgentTool::name).toList());
        }

        List<Map<String, Object>> messages = withHistory(systemPrompt(hits, true, external), history, message);
        List<Map<String, Object>> toolDefs = tools.toolDefinitions(external);
        // Tier "fast" (8B) par défaut ; les tours avec outils externes MCP peuvent viser un tier plus fort.
        String tier = external.isEmpty() ? "fast" : mcpToolTier;

        for (int i = 0; i < MAX_TOOL_ITERS; i++) {
            JsonNode msg = llm.rawChat(model, messages, toolDefs, tier);
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
                        AgentTool tool = tools.get(name, external);
                        if (tool == null) {
                            result = "Outil inconnu: " + name; status = "error";
                        } else if (confirmExternalWrites && tool instanceof ExternalMcpTool ext && !ext.isReadOnly()) {
                            // Écriture externe : NE PAS exécuter — proposer l'action à l'utilisateur (validation humaine).
                            result = "Action externe proposée à l'utilisateur — en attente de sa validation. "
                                + "Ne pas ré-appeler cet outil ; résume simplement l'action que tu proposes.";
                            status = "pending";
                        } else {
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

    private String runDirect(String message, List<KnowledgeNode> hits, List<Map<String, Object>> history) {
        // Tier "fast" : petit modèle 8B pour les réponses simples/interactives (rapide).
        // Historique injecté (mémoire multi-tours) entre le system prompt et le message courant.
        return llm.chat(model, withHistory(systemPrompt(hits, false, List.of()), history, message), "fast");
    }

    /** Liste de messages LLM : system + historique (mémoire multi-tours) + message courant. */
    private static List<Map<String, Object>> withHistory(String systemPrompt,
                                                         List<Map<String, Object>> history, String message) {
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt));
        if (history != null) messages.addAll(history);
        messages.add(Map.of("role", "user", "content", message));
        return messages;
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

    private String systemPrompt(List<KnowledgeNode> hits, boolean withTools, List<AgentTool> external) {
        StringBuilder sb = new StringBuilder();
        sb.append("Tu es Cortex, le copilote IA du workspace TaskForce. Réponds dans la langue de l'utilisateur, ")
          .append("de façon concise et fondée sur le contexte réel. ");
        if (withTools) {
            sb.append("Tu peux utiliser l'outil de recherche mémoire (search_brain). ");
            if (external != null && !external.isEmpty()) {
                String names = external.stream().map(AgentTool::name)
                    .collect(java.util.stream.Collectors.joining(", "));
                sb.append("Des outils externes sont connectés (serveurs MCP) : ").append(names)
                  .append(". N'appelle un outil d'écriture externe qu'avec des paramètres explicites et vérifiés, ")
                  .append("et jamais sans que l'utilisateur l'ait demandé. ");
            }
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
