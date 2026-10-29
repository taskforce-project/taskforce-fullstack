package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
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
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.LlmToolsRefusedException;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.core.service.mcp.ExternalMcpTool;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Cœur agentique de l'assistant (Cortex) : recherche dans le Brain OS (RAG), puis le modèle répond en
 * appelant, <b>s'il le juge utile</b>, ses outils (TaskForce, Brain OS, serveurs MCP connectés). Aucun
 * routage par mots-clés : le modèle choisit ses outils à chaque message.
 *
 * <p><b>Sans IA disponible</b>, la recherche reste réelle : on renvoie les notes trouvées et un message
 * de repli. Les écritures dans un outil externe (MCP) ne sont jamais exécutées par le modèle : elles sont
 * proposées à un propriétaire ou un administrateur, qui les valide dans la conversation ; aucun réglage ne
 * lève cette validation.</p>
 *
 * <p><b>PC-022 — aucune transaction n'englobe la boucle LLM.</b> L'orchestrateur ne tient aucune
 * transaction ; chaque accès à la base passe par un collaborateur transactionnel (BrainAccessGuard,
 * BrainSearchService, services appelés par les outils, AiUsageService), une transaction courte par
 * opération, jamais tenue pendant l'appel au modèle.</p>
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
    private final AuthorizationService authorization;

    // Tier des tours avec outils externes MCP. Défaut "fast" ; "standard" pour plus de fiabilité
    // multi-outils si le matériel suit.
    @Value("${integrations.mcp.tool-tier:fast}")
    private String mcpToolTier;

    /** Plafond d'outils MCP externes envoyés au modèle par requête (les plus pertinents d'abord).
     *  Un petit modèle local a un contexte court : trop de schémas d'outils le saturent. 0 = aucun. */
    @Value("${integrations.mcp.max-tools-per-request:12}")
    private int maxExternalTools;

    private static final int MAX_TOOL_ITERS = 5;

    private static final String STEP_SEARCH = "Searching your workspace's notes";
    private static final String STEP_ANSWER = "Writing the answer";

    public AssistantAnswer run(String slug, Long userId, String message) {
        return run(slug, userId, message, List.of());
    }

    /**
     * Variante avec <b>mémoire multi-tours</b> : {@code history} = messages précédents de la conversation
     * (format {@code {role, content}}, ordre chronologique), injectés avant le message courant.
     */
    public AssistantAnswer run(String slug, Long userId, String message, List<Map<String, Object>> history) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        AgentContext ctx = new AgentContext(slug, ws.getId(), userId);
        List<Map<String, Object>> hist = history == null ? List.of() : history;

        // Salutation ou remerciement : réponse directe, sans recherche (pas de sources hors sujet).
        if (isConversational(message)) {
            return runConversational(ws.getId(), message, hist);
        }

        // ── Recherche (RAG), réelle avec ou sans IA ──────────────────────────
        List<KnowledgeNode> hits = search.retrieveRelevant(ws.getId(), message, 5);
        List<AssistantSource> sources = hits.stream()
            .map(n -> new AssistantSource(n.getTitle(), n.getDomain().name(), null))
            .toList();

        List<AssistantStep> steps = new ArrayList<>();
        String domains = hits.stream().map(n -> n.getDomain().name()).distinct().collect(Collectors.joining(" · "));
        steps.add(new AssistantStep(STEP_SEARCH, "done",
            hits.isEmpty() ? "No relevant note found" : hits.size() + " note(s) · " + domains));

        if (!llm.isConfigured()) {
            steps.add(new AssistantStep(STEP_ANSWER, "pending", "AI is not configured on this instance"));
            return new AssistantAnswer(fallbackAnswer(hits), null, "fallback",
                sources, steps, List.of(), AssistantUsage.NONE);
        }

        // Quota IA mensuel du compte : 409 si le plafond de tokens est atteint, avant tout appel.
        aiUsageService.assertWithinQuota(ws.getId());

        llm.beginUsageCapture();
        try {
            steps.add(new AssistantStep(STEP_ANSWER, "active", "Cortex answers, with its tools if needed"));
            List<AssistantToolCall> toolCalls = new ArrayList<>();
            String modelAnswer = runToolLoop(message, hits, ctx, toolCalls, hist);
            String answer = honestAnswer(message, modelAnswer, toolCalls);
            if (answer.equals(modelAnswer)) {
                steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "done", toolsDescription(toolCalls)));
            } else {
                log.warn("Cortex (ws={}) : la réponse annonçait une écriture qu'aucun outil n'a faite, remplacée",
                    ws.getId());
                steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error", "No action ran: nothing was created"));
            }
            LlmUsage usage = llm.currentUsage();
            recordUsage(ws.getId(), usage);
            return new AssistantAnswer(answer, null, toolCalls.isEmpty() ? "fast" : "deep",
                sources, steps, toolCalls, toUsage(usage));
        } catch (LlmToolsRefusedException ex) {
            log.warn("Cortex (slug={}) : le fournisseur refuse les outils", LogSafe.of(slug));
            steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error",
                "The AI provider refused Cortex's tools: nothing was done"));
            LlmUsage usage = llm.currentUsage();
            recordUsage(ws.getId(), usage);
            return new AssistantAnswer(toolsRefusedAnswer(hits), null, "fallback", sources, steps, List.of(), toUsage(usage));
        } catch (Exception ex) {
            log.warn("Agent LLM indisponible (slug={}): {}", LogSafe.of(slug), LogSafe.of(ex.getMessage()));
            steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error",
                "The model did not answer: here are the notes of your workspace"));
            LlmUsage usage = llm.currentUsage(); // usage partiel réel (appels déjà faits avant l'échec)
            recordUsage(ws.getId(), usage);
            return new AssistantAnswer(fallbackAnswer(hits), null, "fallback", sources, steps, List.of(), toUsage(usage));
        } finally {
            llm.endUsageCapture();
        }
    }

    /** Détail de l'étape de réponse une fois terminée : outils mobilisés, s'il y en a eu. */
    private static String toolsDescription(List<AssistantToolCall> toolCalls) {
        String used = toolCalls.stream().map(AssistantToolCall::name).distinct().collect(Collectors.joining(", "));
        return used.isEmpty() ? "Answered directly (no tool needed)" : "Tools: " + used;
    }

    private static AssistantUsage toUsage(LlmUsage u) {
        if (u == null) return AssistantUsage.NONE; // garde défensive (mocks)
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
    // Message conversationnel (salutation, remerciement) : réponse directe, sans recherche ni sources
    // -------------------------------------------------------------------------

    private static final String CONVERSATIONAL_PROMPT =
        "You are Cortex, the AI copilot of a TaskForce workspace. Answer this conversational message "
        + "(greeting, thanks, small talk) briefly, naturally and warmly, in the user's language. Cite NO "
        + "source and invent no project context. One or two sentences at most.";

    private static final Set<String> SMALLTALK = Set.of(
        "hello", "hi", "hey", "yo", "thanks", "thank you", "thx", "ok", "okay", "yes", "no", "cool",
        "great", "perfect", "nice", "bye", "good morning", "good evening", "good night", "how are you",
        "what's up", "whats up",
        "bonjour", "salut", "coucou", "bonsoir", "merci", "merci beaucoup", "d'accord", "oui", "non",
        "super", "parfait", "top", "au revoir", "ça va", "ca va", "comment ça va", "comment ca va");

    /** Salutation ou remerciement pur : on retire une salutation de tête éventuelle, puis on compare. */
    static boolean isConversational(String message) {
        if (message == null) return false;
        String m = message.trim().toLowerCase()
            .replaceAll("[!?.,;:]+$", "").trim()
            .replaceAll("\\s+", " ");
        if (m.isEmpty() || m.length() > 40) return false;
        if (SMALLTALK.contains(m)) return true;
        String core = m.replaceFirst("^(hello|hi|hey|yo|bonjour|salut|coucou|bonsoir)\\b[\\s,!]*", "").trim();
        return core.isEmpty() || SMALLTALK.contains(core);
    }

    private AssistantAnswer runConversational(Long workspaceId, String message, List<Map<String, Object>> history) {
        List<AssistantStep> steps = new ArrayList<>();
        if (!llm.isConfigured()) {
            steps.add(new AssistantStep(STEP_ANSWER, "pending", "AI is not configured on this instance"));
            return new AssistantAnswer(smallTalkFallback(), null, "fallback", List.of(), steps, List.of(), AssistantUsage.NONE);
        }

        // Même quota que le chemin principal : sans lui, un compte au plafond le contournait en
        // enchaînant les salutations.
        aiUsageService.assertWithinQuota(workspaceId);

        llm.beginUsageCapture();
        try {
            steps.add(new AssistantStep(STEP_ANSWER, "active", "Cortex answers"));
            String answer = llm.chat(withHistory(CONVERSATIONAL_PROMPT, history, message), "fast");
            steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "done", "Answered directly"));
            LlmUsage usage = llm.currentUsage();
            recordUsage(workspaceId, usage);
            return new AssistantAnswer(answer, null, "fast", List.of(), steps, List.of(), toUsage(usage));
        } catch (Exception ex) {
            log.warn("Cortex (conversation) indisponible : {}", ex.getMessage());
            steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error", "The model did not answer"));
            LlmUsage usage = llm.currentUsage();
            recordUsage(workspaceId, usage);
            return new AssistantAnswer(smallTalkFallback(), null, "fallback", List.of(), steps, List.of(), toUsage(usage));
        } finally {
            llm.endUsageCapture();
        }
    }

    private static String smallTalkFallback() {
        return "Hello! I'm **Cortex**, the AI copilot of your workspace. Ask me about your projects, "
            + "decisions or docs and I'll look in your workspace's notes.";
    }

    // -------------------------------------------------------------------------
    // Boucle d'outils : le modèle choisit d'en appeler ou de répondre directement
    // -------------------------------------------------------------------------

    private String runToolLoop(String message, List<KnowledgeNode> hits, AgentContext ctx,
                               List<AssistantToolCall> toolCalls, List<Map<String, Object>> history) {
        // Outils externes (serveurs MCP connectés sur le workspace), découverts par requête et bornés par
        // pertinence avant l'envoi : un gros serveur MCP envoyé en entier sature un petit modèle.
        List<AgentTool> external = relevantExternal(workspaceMcp.toolsFor(ctx), message);
        if (!external.isEmpty()) {
            log.info("Cortex (ws={}) : {} outil(s) interne(s) + {} externe(s) MCP {}",
                ctx.workspaceId(), tools.all().size(), external.size(),
                external.stream().map(AgentTool::name).toList());
        }

        List<Map<String, Object>> messages = withHistory(systemPrompt(hits, external), history, message);
        List<Map<String, Object>> toolDefs = tools.toolDefinitions(external);
        String tier = external.isEmpty() ? "fast" : mcpToolTier;

        for (int i = 0; i < MAX_TOOL_ITERS; i++) {
            JsonNode msg = llm.rawChat(messages, toolDefs, tier);
            JsonNode calls = msg.path("tool_calls");
            if (!calls.isArray() || calls.isEmpty()) {
                return msg.path("content").asText("");
            }
            messages.add(objectMapper.convertValue(msg, new TypeReference<Map<String, Object>>() {}));
            for (JsonNode call : calls) {
                String id = call.path("id").asText();
                String name = call.path("function").path("name").asText();
                String argsJson = call.path("function").path("arguments").asText("{}");
                String result;
                String status = "success";
                try {
                    AgentTool tool = tools.get(name, external);
                    if (tool == null) {
                        result = "Unknown tool: " + name;
                        status = "error";
                    } else if (tool instanceof ExternalMcpTool ext && !ext.isReadOnly()) {
                        // Écriture externe : jamais exécutée par le modèle. Proposée seulement à qui peut la
                        // valider (propriétaire ou administrateur, OSS-1.5), refusée d'emblée aux autres.
                        if (authorization.isManager(ctx.workspaceId(), ctx.userId())) {
                            result = "Action proposed to the user, waiting for their approval in the conversation. "
                                + "Do not call this tool again; just summarize the action you propose.";
                            status = "pending";
                        } else {
                            result = "Not run: only workspace owners and admins can approve a change in an external "
                                + "tool. Tell the user that an owner or admin has to make this change.";
                            status = "error";
                        }
                    } else {
                        Map<String, Object> args = objectMapper.readValue(argsJson, new TypeReference<Map<String, Object>>() {});
                        result = tool.execute(args, ctx);
                    }
                } catch (Exception e) {
                    result = "Tool " + name + " failed: " + e.getMessage();
                    status = "error";
                }
                toolCalls.add(new AssistantToolCall(name, status, argsJson, result));
                messages.add(Map.of("role", "tool", "tool_call_id", id, "content", result));
            }
        }
        return "Answer interrupted (too many tool steps).";
    }

    /**
     * Borne des outils MCP externes avant l'envoi au modèle. Sous {@code maxExternalTools}, on garde tout ;
     * au-dessus, on priorise (connecteur nommé dans le message, puis nom d'outil qui recoupe le message,
     * ex. « issues » pour {@code list_issues}) et on plafonne.
     */
    private List<AgentTool> relevantExternal(List<AgentTool> external, String message) {
        if (maxExternalTools <= 0) return List.of();
        if (external.size() <= maxExternalTools) return external;
        String lower = message == null ? "" : message.toLowerCase();
        return external.stream()
            .sorted(Comparator.comparingInt((AgentTool t) -> toolScore(t.name(), lower)).reversed())
            .limit(maxExternalTools)
            .toList();
    }

    /** Priorité d'un outil : +100 si son connecteur (préfixe avant « __ ») est nommé dans le message,
     *  +1 par segment de son nom (après « __ », coupé sur _/-, au moins 3 lettres) présent dans le message. */
    private static int toolScore(String toolName, String lowerMessage) {
        int sep = toolName.indexOf("__");
        int score = 0;
        if (sep > 0 && lowerMessage.contains(toolName.substring(0, sep).toLowerCase())) score += 100;
        String bare = (sep > 0 ? toolName.substring(sep + 2) : toolName).toLowerCase();
        for (String part : bare.split("[_-]")) {
            if (part.length() >= 3 && lowerMessage.contains(part)) score++;
        }
        return score;
    }

    /** Liste de messages : système + historique (mémoire multi-tours) + message courant. */
    private static List<Map<String, Object>> withHistory(String systemPrompt,
                                                         List<Map<String, Object>> history, String message) {
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt));
        if (history != null) messages.addAll(history);
        messages.add(Map.of("role", "user", "content", message));
        return messages;
    }

    private String systemPrompt(List<KnowledgeNode> hits, List<AgentTool> external) {
        StringBuilder sb = new StringBuilder();
        sb.append("You are Cortex, the AI copilot of a TaskForce workspace. Answer in the user's language, ")
          .append("concisely, grounded in the real context. ")
          .append("Use your tools only when they help: search the workspace's notes, list or create TaskForce ")
          .append("projects and issues, write a note. ")
          .append("Never create anything the user did not ask for. ")
          .append("Say that you created, changed or deleted something only when a tool result in this conversation ")
          .append("confirms it; if no tool ran or a tool failed, say plainly that it was not done. ")
          .append("Never name your tools or describe your internal steps to the user. ")
          .append("If you need data from an external system you have no tool for, call find_integration: when ")
          .append("the integration exists but is not connected, invite the user to connect it (Settings > ")
          .append("Integrations); when it is not in the catalog, say so plainly and add that a tool with an MCP ")
          .append("server can still be connected there. Never make data up. ");
        if (!external.isEmpty()) {
            String names = external.stream().map(AgentTool::name).collect(Collectors.joining(", "));
            sb.append("External tools are connected (MCP servers): ").append(names).append(". ")
              .append("When one of them can answer (read data from a connected system), CALL IT instead of ")
              .append("guessing or saying you have no access: if the tool is there, the access is there. ")
              .append("A tool prefixed with \"<service>__\" acts on that external system; without a prefix, on TaskForce. ")
              .append("For an action possible on both sides (e.g. creating an issue), target TaskForce by default; ")
              .append("target an external system only when the user names it. ")
              .append("Call an external write tool only with explicit, checked parameters and only when the user ")
              .append("asked for it; it never runs directly: an owner or admin approves it in the conversation. ");
        }
        if (!hits.isEmpty()) {
            sb.append("\n\nContext (the workspace's notes):\n");
            for (KnowledgeNode n : hits) {
                String c = n.getContent() != null ? n.getContent() : "";
                if (c.length() > 400) c = c.substring(0, 400) + "…";
                sb.append("- [").append(n.getDomain()).append("] ").append(n.getTitle())
                  .append(": ").append(c.replace("\n", " ")).append("\n");
            }
        }
        return sb.toString();
    }

    // -------------------------------------------------------------------------
    // Une action ne se dit faite que si un outil l'a faite (R35, séance n°7 du Conseil)
    // -------------------------------------------------------------------------

    /** Les écritures de TaskForce : seule la réussite de l'une d'elles permet d'annoncer une création. */
    private static final Set<String> WRITE_TOOLS = Set.of("create_issue", "create_project", "create_note");

    private static final int REGEX_FLAGS = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS;

    /** Une demande de création : un verbe et un objet de l'espace, en anglais ou en français. */
    private static final Pattern WRITE_REQUEST = Pattern.compile(
        "\\b(create|add|make|open|file|log|crée[rz]?|cree[rz]?|ajoute[rz]?|ouvre[rz]?)\\b.*"
            + "\\b(issues?|tickets?|tasks?|bugs?|projects?|notes?|tâches?|taches?|projets?)\\b", REGEX_FLAGS);

    /** Une phrase qui annonce une création faite, toujours rattachée à son objet. */
    private static final Pattern WRITE_CLAIM = Pattern.compile(
        "\\b(issue|ticket|task|project|note)s?\\s+(has\\s+been\\s+|have\\s+been\\s+|was\\s+|were\\s+)?(created|added|opened)\\b"
            + "|\\b(created|added|opened)\\s+(a\\s+|an\\s+|the\\s+|your\\s+|\\d+\\s+)?(new\\s+)?(issue|ticket|task|project|note)s?\\b"
            + "|\\b(issue|ticket|tâche|tache|projet|note)s?\\s+(a\\s+été\\s+|ont\\s+été\\s+)?(créée?s?|ajoutée?s?)"
            + "|\\b(créé|ajouté)e?s?\\s+(une\\s+|un\\s+|la\\s+|le\\s+|les\\s+|\\d+\\s+)?(nouvelle\\s+|nouveau\\s+)?"
            + "(issue|ticket|tâche|tache|projet|note)s?\\b", REGEX_FLAGS);

    /**
     * La réponse à montrer : celle du modèle, sauf s'il annonce une création qu'aucun outil n'a faite. Un petit modèle
     * l'a fait le 29/10/2026 (« Issue created », rien de créé) ; c'est le résultat de l'outil qui fait foi, pas la
     * phrase. Ne joue que sur une demande de création, pour ne pas toucher une réponse qui raconte l'historique.
     */
    static String honestAnswer(String message, String answer, List<AssistantToolCall> toolCalls) {
        if (answer == null || message == null) return answer == null ? "" : answer;
        boolean wrote = toolCalls.stream()
            .anyMatch(call -> WRITE_TOOLS.contains(call.name()) && "success".equals(call.status()));
        if (wrote || !WRITE_REQUEST.matcher(message).find() || !WRITE_CLAIM.matcher(answer).find()) return answer;
        if (toolCalls.stream().anyMatch(call -> "pending".equals(call.status()))) {
            return "Nothing has changed yet: the action below waits for your approval.";
        }
        boolean failed = toolCalls.stream()
            .anyMatch(call -> WRITE_TOOLS.contains(call.name()) && "error".equals(call.status()));
        return failed
            ? "I couldn't do it, so nothing was created. Ask me again, or create it from the board."
            : "I didn't create anything: no action ran. Ask me again with the project's name, or create it from the board.";
    }

    /** Le fournisseur a refusé les outils : rien n'a été fait, on le dit, avec les notes trouvées. */
    private static String toolsRefusedAnswer(List<KnowledgeNode> hits) {
        StringBuilder sb = new StringBuilder();
        if (!hits.isEmpty()) {
            sb.append("Here are the most relevant notes of your workspace:\n\n");
            for (KnowledgeNode n : hits) {
                sb.append("- [[").append(n.getTitle()).append("]] (").append(n.getDomain()).append(")\n");
            }
            sb.append("\n\n");
        }
        sb.append("> [!warning] Cortex could not act\n")
          .append("> The AI provider refused the tools Cortex needs, so nothing was created or changed. ")
          .append("Try again in a moment.");
        return sb.toString();
    }

    /** Réponse sans modèle : les notes trouvées par la recherche, et l'état de l'IA. */
    private String fallbackAnswer(List<KnowledgeNode> hits) {
        StringBuilder sb = new StringBuilder();
        if (hits.isEmpty()) {
            sb.append("I found no relevant note in your workspace for this request.");
        } else {
            sb.append("Here are the most relevant notes of your workspace:\n\n");
            for (KnowledgeNode n : hits) {
                sb.append("- [[").append(n.getTitle()).append("]] (").append(n.getDomain()).append(")\n");
            }
        }
        sb.append("\n\n> [!note] AI unavailable\n")
          .append("> Generated answers, reasoning and actions need an AI provider: Ollama on this machine, ")
          .append("or any OpenAI-compatible API, configured on the AI service of the instance.");
        return sb.toString();
    }
}
