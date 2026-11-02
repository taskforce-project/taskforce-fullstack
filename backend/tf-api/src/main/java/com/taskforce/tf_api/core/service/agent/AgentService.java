package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.AssistantActionResult;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantSource;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantStep;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantToolCall;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantUsage;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.enums.NodeDomain;
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
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
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
    private final CortexGate          gate;
    private final CortexRecordService records;
    private final CortexUndo          undo;

    // Tier des tours avec outils externes MCP. Défaut "fast" ; "standard" pour plus de fiabilité
    // multi-outils si le matériel suit.
    @Value("${integrations.mcp.tool-tier:fast}")
    private String mcpToolTier;

    /** Plafond d'outils MCP externes envoyés au modèle par requête (les plus pertinents d'abord).
     *  Un petit modèle local a un contexte court : trop de schémas d'outils le saturent. 0 = aucun. */
    @Value("${integrations.mcp.max-tools-per-request:12}")
    private int maxExternalTools;

    private static final int MAX_TOOL_ITERS = 5;

    /** La date du jour, dite au modèle pour qu'il place une issue dans le temps (R48, séance n°8). */
    private static final DateTimeFormatter TODAY = DateTimeFormatter.ofPattern("EEEE d MMMM yyyy", Locale.ENGLISH);

    private static final String STEP_SEARCH = "Searching your workspace's notes";
    private static final String STEP_ANSWER = "Writing the answer";

    public AssistantAnswer run(String slug, Long userId, String message) {
        return run(slug, userId, message, List.of());
    }

    /**
     * Lance une action que Cortex a proposée et que la personne vient d'accorder (R35). L'accord ne vaut que pour
     * une proposition du dossier, une seule fois ; l'action est rejugée par les règles de l'espace, qui ont pu changer,
     * puis exécutée avec les droits de la personne, et gardée au dossier de la réponse qui l'a proposée. Une écriture
     * externe reste réservée aux propriétaires et administrateurs (OSS-1.5).
     */
    public AssistantActionResult runApproved(String slug, Long userId, String toolName, String argsJson, String recordRef) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        AgentContext ctx = new AgentContext(slug, ws.getId(), userId);
        UUID record = recordId(recordRef);
        if (!records.owns(record, ctx)) {
            throw new ResourceNotFoundException("This conversation's record was not found.");
        }
        AgentTool tool = tools.get(toolName);
        if (tool == null && toolName.contains("__")) {
            tool = tools.get(toolName, workspaceMcp.toolsFor(ctx));
        }
        if (tool == null) {
            throw new BusinessException("This action is no longer available.");
        }
        if (tool instanceof ExternalMcpTool && !authorization.isManager(ws.getId(), userId)) {
            throw new BusinessException("Only workspace owners and admins can approve a change in an external tool.");
        }
        if (!records.approve(record, toolName, userId, argsJson)) {
            throw new BusinessException("This action is no longer waiting for your approval.");
        }
        CortexGate.Verdict verdict = gate.judge(gate.rulesFor(ctx), tool);
        traceBefore(record, "action.decided", CortexRecordService.Actor.rule(verdict.ruleId()),
            Map.of("effect", verdict.effect(), "facts", verdict.facts()));
        String status = "success";
        String output;
        CortexGesture.Done done = null;
        try {
            if (verdict.denied()) {
                status = "refused";
                output = "Not run: the rules of this workspace refuse it. " + verdict.reason();
            } else {
                Map<String, Object> args = objectMapper.readValue(argsJson == null || argsJson.isBlank() ? "{}" : argsJson,
                    new TypeReference<Map<String, Object>>() {});
                if (tool instanceof CortexGesture gesture) {
                    done = gesture.perform(args, ctx);
                    output = done.text();
                } else {
                    output = tool.execute(args, ctx);
                }
            }
        } catch (JsonProcessingException e) {
            status = "error";
            output = "The arguments of this action are not readable.";
        } catch (RuntimeException e) {
            traceAfter(record, toolName, "error", e.getMessage(), null);
            throw e;
        }
        String ref = traceAfter(record, toolName, status, output, done == null ? null : done.undo());
        return new AssistantActionResult(toolName, status, output, undoable(tool, status, done) ? ref : null,
            done == null ? null : done.target());
    }

    /**
     * Un résultat que « Undo » peut nommer : une création réussie, ou un geste qui a gardé de quoi se défaire. Un geste qui
     * n'a rien changé (« already has these values ») ou une lecture n'en a pas : la carte ne montre pas d'Undo qui
     * échouerait (vérification du 02/11/2026).
     */
    private static boolean undoable(AgentTool tool, String status, CortexGesture.Done done) {
        if (!"success".equals(status)) return false;
        return !(tool instanceof CortexGesture) || (done != null && done.undo() != null);
    }

    /**
     * Défait d'un geste ce que Cortex vient de faire (R77, séance n°13) : le résultat que nomme {@code ref}, sinon la
     * dernière réussite de cet outil, dans le dossier de la réponse, une seule fois et avec les droits de la personne.
     * L'outil dit ce qu'il a défait, ou pourquoi ce n'est plus possible (une exception métier).
     */
    public AssistantActionResult undo(String slug, Long userId, String toolName, String recordRef, String ref) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        AgentContext ctx = new AgentContext(slug, ws.getId(), userId);
        UUID record = recordId(recordRef);
        if (!records.owns(record, ctx)) {
            throw new ResourceNotFoundException("This conversation's record was not found.");
        }
        if (!undo.handles(toolName)) {
            throw new BusinessException("This action can't be undone.");
        }
        String undone = records.undo(record, toolName, userId, ref, result -> undo.undo(toolName, result, ctx))
            .orElseThrow(() -> new BusinessException("There is nothing left to undo here."));
        return new AssistantActionResult(toolName, "success", undone);
    }

    /** Tracer avant d'agir : un événement que le dossier ne prend plus (il est plein) arrête l'action. */
    private void traceBefore(UUID record, String type, CortexRecordService.Actor actor, Map<String, ?> data) {
        if (records.append(record, type, actor, data).isEmpty()) {
            throw new BusinessException("The record of this answer is full, so the action does not run.");
        }
    }

    /**
     * Le résultat au dossier, avec de quoi le défaire pour un geste, et son empreinte, que « Undo » nommera. Une panne ici
     * ne défait pas ce qui a été fait, ni ne le dit raté : elle se journalise, et le résultat n'a pas d'empreinte.
     */
    private String traceAfter(UUID record, String tool, String status, String output, Map<String, Object> undoData) {
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("tool", tool);
            data.put("status", status);
            data.put("output", CortexRecordService.shorten(output));
            if (undoData != null) data.put("undo", undoData);
            return records.append(record, "action.result", CortexRecordService.Actor.SERVER, data).orElse(null);
        } catch (RuntimeException e) {
            log.warn("Cortex : résultat de {} non gardé au dossier : {}", LogSafe.of(tool), LogSafe.of(e.getMessage()));
            return null;
        }
    }

    private static UUID recordId(String ref) {
        try {
            return UUID.fromString(ref);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BusinessException("This conversation's record is not valid.");
        }
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

        // ── Recherche (RAG), réelle avec ou sans IA, dans les notes que la personne lit ──
        List<KnowledgeNode> hits = search.retrieveRelevant(access.viewer(ws.getId(), userId), message, 5);
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
        // Hors du try : si le modèle ou le fournisseur s'arrête après une écriture, la réponse doit encore la montrer.
        List<AssistantToolCall> toolCalls = new ArrayList<>();
        try {
            steps.add(new AssistantStep(STEP_ANSWER, "active", "Cortex answers, with its tools if needed"));
            // Un geste qui se demande parle par sa carte : la phrase du modèle ne dit pas « je supprime » à sa place.
            String modelAnswer = cardAnswer(runToolLoop(message, hits, ctx, toolCalls, hist), toolCalls);
            // R116 : une phrase qui annonce une action sans son résultat d'outil est remplacée par la vérité, signée par
            // TaskForce, et l'incident entre au dossier de la réponse (E17).
            ActionClaimCheck.Checked checked = ActionClaimCheck.check(modelAnswer, ActionClaimCheck.Ran.of(toolCalls));
            String record = toolCalls.stream().map(AssistantToolCall::record).filter(Objects::nonNull).findFirst().orElse(null);
            if (!checked.corrected()) {
                steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "done", toolsDescription(toolCalls)));
            } else {
                log.warn("Cortex (ws={}) : la réponse annonçait une action qu'aucun outil n'a faite, corrigée par TaskForce",
                    ws.getId());
                record = trustIncident(ctx, message, hits, toolCalls, checked, record);
                steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error",
                    "Cortex said something was done that no action did: TaskForce corrected it"));
            }
            LlmUsage usage = llm.currentUsage();
            recordUsage(ws.getId(), usage);
            return new AssistantAnswer(checked.answer(), null, toolCalls.isEmpty() ? "fast" : "deep",
                sources, steps, toolCalls, toUsage(usage), record);
        } catch (LlmToolsRefusedException ex) {
            log.warn("Cortex (slug={}) : le fournisseur refuse les outils", LogSafe.of(slug));
            LlmUsage usage = llm.currentUsage();
            recordUsage(ws.getId(), usage);
            if (!toolCalls.isEmpty()) return stopped(steps, sources, toolCalls, usage, "The AI provider refused Cortex's tools");
            steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error",
                "The AI provider refused Cortex's tools: nothing was done"));
            return new AssistantAnswer(toolsRefusedAnswer(hits), null, "fallback", sources, steps, List.of(), toUsage(usage));
        } catch (Exception ex) {
            log.warn("Agent LLM indisponible (slug={}): {}", LogSafe.of(slug), LogSafe.of(ex.getMessage()));
            LlmUsage usage = llm.currentUsage(); // usage partiel réel (appels déjà faits avant l'échec)
            recordUsage(ws.getId(), usage);
            if (!toolCalls.isEmpty()) return stopped(steps, sources, toolCalls, usage, "The model stopped answering");
            steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error",
                "The model did not answer: here are the notes of your workspace"));
            return new AssistantAnswer(fallbackAnswer(hits), null, "fallback", sources, steps, List.of(), toUsage(usage));
        } finally {
            llm.endUsageCapture();
        }
    }

    /**
     * Arrêt en cours de route, après des appels d'outils : ce qui a été fait reste dans la réponse, avec ses étapes, pour
     * que la personne le voie et ne le redemande pas (une issue déjà créée ne doit pas passer pour « rien n'a été fait »).
     */
    private static AssistantAnswer stopped(List<AssistantStep> steps, List<AssistantSource> sources,
                                           List<AssistantToolCall> toolCalls, LlmUsage usage, String cause) {
        steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error", cause + ": Cortex stopped before the end"));
        String answer = "> [!warning] Cortex stopped before the end\n> " + cause
            + ". What it had already done shows in its steps: check it before asking again, so nothing is done twice.";
        return new AssistantAnswer(answer, null, "deep", sources, steps, toolCalls, toUsage(usage));
    }

    /**
     * L'incident de confiance au dossier de la réponse (E17) : ce que le modèle a dit, ce que TaskForce a montré. Une
     * réponse sans outil n'avait pas de dossier : il s'ouvre pour l'incident. Une panne du dossier ne défait pas la
     * correction, déjà faite : elle se journalise.
     */
    private String trustIncident(AgentContext ctx, String message, List<KnowledgeNode> hits,
                                 List<AssistantToolCall> toolCalls, ActionClaimCheck.Checked checked, String record) {
        try {
            Map<String, Object> origin = new LinkedHashMap<>();
            origin.put("model", llm.currentModel());
            origin.putAll(origin(null, hits));
            return records.incident(ctx, record == null ? null : UUID.fromString(record), message, origin,
                checked.incident(ActionClaimCheck.Ran.of(toolCalls))).toString();
        } catch (RuntimeException e) {
            log.warn("Cortex : incident de confiance non gardé au dossier : {}", LogSafe.of(e.getMessage()));
            return record;
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

        List<Map<String, Object>> messages = withHistory(systemPrompt(hits, external, LocalDate.now(ZoneOffset.UTC)),
            history, message);
        List<Map<String, Object>> toolDefs = tools.toolDefinitions(external);
        String tier = external.isEmpty() ? "fast" : mcpToolTier;
        // Le noyau (R35) : les règles de l'espace et le dossier de la réponse, ouverts au premier outil.
        Kernel kernel = new Kernel(ctx, message, origin(tier, hits));
        return toolLoop(messages, toolDefs, external, toolCalls, (msgs, defs) -> llm.rawChat(msgs, defs, tier), kernel);
    }

    /**
     * Rejoue un cas de la banque avec un modèle nommé, ou le tier rapide s'il n'y en a pas. Le modèle
     * reçoit les notes et la date du cas ; une lecture est servie par sa cassette, une écriture est proposée et jamais
     * exécutée, et aucun dossier ne s'écrit. Le quota et le frein de débit sont à l'appelant, comme pour une réponse.
     */
    public ReplayOutcome replay(AgentContext ctx, ReplayCase replayCase, String model) {
        List<KnowledgeNode> notes = replayCase.notes().stream()
            .map(note -> KnowledgeNode.builder().title(note.title()).domain(domainOf(note.domain()))
                .content(note.content()).build())
            .toList();
        List<Map<String, Object>> messages = withHistory(systemPrompt(notes, List.of(), replayCase.askedOn()),
            List.of(), replayCase.question());
        ReplayStep step = new ReplayStep(replayCase, gate.rulesFor(ctx));
        llm.beginUsageCapture();
        try {
            String answer = toolLoop(messages, tools.toolDefinitions(List.of()), List.of(), new ArrayList<>(),
                (msgs, defs) -> model == null || model.isBlank()
                    ? llm.rawChat(msgs, defs, "fast")
                    : llm.rawChatWithModel(msgs, defs, model),
                step);
            // R116 : la banque note la réponse que la personne verrait, corrigée par TaskForce.
            List<ActionClaimCheck.Ran> ran = step.calls.stream()
                .map(call -> new ActionClaimCheck.Ran(call.tool(), call.status())).toList();
            return new ReplayOutcome(ActionClaimCheck.check(answer, ran).answer(), step.calls, llm.currentModel(),
                llm.currentUsage());
        } finally {
            llm.endUsageCapture();
        }
    }

    /** Ce qui appelle le modèle : le tier d'une réponse, ou un modèle nommé au rejeu. */
    @FunctionalInterface
    private interface ModelCall {
        JsonNode call(List<Map<String, Object>> messages, List<Map<String, Object>> toolDefs);
    }

    /** Ce que devient un appel d'outil : par le noyau dans une réponse, par la cassette au rejeu. */
    private interface ToolStep {
        ToolOutcome apply(AgentTool tool, String name, String argsJson);

        String recordRef();
    }

    /**
     * {@code input} : les arguments que la carte montre, quand le serveur les a résolus ; null, ceux de Cortex.
     * {@code ref} : l'empreinte d'un résultat réussi au dossier, que « Undo » nomme. {@code target} : l'issue d'un geste.
     */
    private record ToolOutcome(String status, String result, String input, String ref, Map<String, Object> target) {
        ToolOutcome(String status, String result) {
            this(status, result, null, null, null);
        }
    }

    private static final String PROPOSED = "Action proposed to the user, waiting for their approval in the conversation. "
        + "Do not call this tool again; just summarize the action you propose.";

    /**
     * Les outils dont Cortex prépare l'action au lieu de la faire, même quand les règles l'autorisent : une issue se relit
     * et se modifie sur une carte, puis la personne la crée (R47, R78, séance n°13). L'accord passe par le dossier de la
     * réponse, comme pour une action demandée.
     */
    static final Set<String> PREPARED = Set.of("create_issue");

    private static final String PREPARED_TEXT = "Issue prepared as a card in the conversation: the person checks it, "
        + "edits it and creates it. Do not call this tool again; say in one sentence that the card is ready to review, "
        + "and do not say that the issue exists.";

    /**
     * Ce qui manque pour préparer la carte, que seule la personne peut dire (le projet, la personne nommée) : rien ne se
     * montre, Cortex pose une seule question courte (R102 : « pas chiant à remplir »). Statut du résultat : la carte
     * n'attend rien, la question suit dans la réponse.
     */
    static final String QUESTION = "question";

    private static final String QUESTION_TEXT = " No card is shown yet. Ask the person one short question with the "
        + "choices, then prepare the card with the answer. Do not ask about anything else: the other fields stay editable "
        + "on the card.";

    /**
     * Ce qui ne se défait pas d'ici se demande, même quand les règles le permettent (ADR-024, TF-J1-5) : confier une issue
     * à un agent lance sa mission sur la machine de la personne. Ce qui se défait se fait, avec « Undo » (R77).
     */
    private static final String ASKED_TEXT = "This can't be undone from the conversation, so it waits for the person's "
        + "approval on the card below. Do not call this tool again; say in one sentence what you propose.";

    /** Une lecture, ou un résultat que « Undo » défait : Cortex le fait sans demander, quand les règles le permettent. */
    private static boolean doneAtOnce(String name, CortexGate.Verdict verdict) {
        return CortexGate.READS.contains(verdict.facts().get("action")) || CortexUndo.TOOLS.contains(name);
    }

    private static String refusedText(CortexGate.Verdict verdict) {
        return "Not run: the rules of this workspace refuse it. " + verdict.reason()
            + " Do not try again; tell the user why it was not done.";
    }

    /** La boucle : le modèle appelle des outils ou répond, cinq tours au plus. */
    private String toolLoop(List<Map<String, Object>> messages, List<Map<String, Object>> toolDefs,
                            List<AgentTool> external, List<AssistantToolCall> toolCalls, ModelCall model, ToolStep step) {
        for (int i = 0; i < MAX_TOOL_ITERS; i++) {
            JsonNode msg = model.call(messages, toolDefs);
            JsonNode calls = msg.path("tool_calls");
            if (!calls.isArray() || calls.isEmpty()) {
                return msg.path("content").asText("");
            }
            messages.add(objectMapper.convertValue(msg, new TypeReference<Map<String, Object>>() {}));
            for (JsonNode call : calls) {
                String id = call.path("id").asText();
                String name = call.path("function").path("name").asText();
                String argsJson = call.path("function").path("arguments").asText("{}");
                AgentTool tool = tools.get(name, external);
                ToolOutcome outcome = tool == null
                    ? new ToolOutcome("error", "Unknown tool: " + name)
                    : step.apply(tool, name, argsJson);
                String shown = outcome.input() != null ? outcome.input() : argsJson;
                toolCalls.add(new AssistantToolCall(name, outcome.status(), shown, outcome.result(), step.recordRef(),
                    outcome.ref(), outcome.target()));
                messages.add(Map.of("role", "tool", "tool_call_id", id, "content", outcome.result()));
            }
        }
        return "Answer interrupted (too many tool steps).";
    }

    /** Ce qui a répondu : le tier et les notes servies ; le modèle s'y ajoute à l'ouverture du dossier. */
    private static Map<String, Object> origin(String tier, List<KnowledgeNode> hits) {
        Map<String, Object> origin = new LinkedHashMap<>();
        origin.put("tier", tier);
        origin.put("notes", hits.stream().map(note -> {
            Map<String, Object> served = new LinkedHashMap<>();
            served.put("id", note.getId());
            served.put("title", note.getTitle());
            return served;
        }).toList());
        return origin;
    }

    private static NodeDomain domainOf(String domain) {
        try {
            return domain == null ? NodeDomain.PROJET : NodeDomain.valueOf(domain);
        } catch (IllegalArgumentException unknown) {
            return NodeDomain.PROJET;
        }
    }

    /**
     * Le rejeu : la règle de l'espace juge chaque appel comme dans une réponse, sans rien garder ; une lecture
     * autorisée est servie par la cassette, et tout le reste est proposé, jamais exécuté.
     */
    private final class ReplayStep implements ToolStep {
        private final ReplayCase replayCase;
        private final RulesBundle bundle;
        private final List<ReplayOutcome.ReplayCall> calls = new ArrayList<>();

        ReplayStep(ReplayCase replayCase, RulesBundle bundle) {
            this.replayCase = replayCase;
            this.bundle = bundle;
        }

        @Override
        public ToolOutcome apply(AgentTool tool, String name, String argsJson) {
            CortexGate.Verdict verdict = gate.judge(bundle, tool);
            ToolOutcome outcome;
            if (verdict.denied()) {
                outcome = new ToolOutcome("refused", refusedText(verdict));
            } else if (verdict.allowed() && CortexGate.READS.contains(verdict.facts().get("action"))) {
                String served = replayCase.served(name, argsJson);
                outcome = served == null
                    ? new ToolOutcome("error", "Not available in this test case: this read was not made when it was "
                        + "written. Answer from what you have.")
                    : new ToolOutcome("success", served);
            } else {
                outcome = new ToolOutcome("pending", PROPOSED);
            }
            calls.add(new ReplayOutcome.ReplayCall(name, argsJson, verdict.effect(), outcome.status()));
            return outcome;
        }

        @Override
        public String recordRef() {
            return null;
        }
    }

    /**
     * Le noyau pour une réponse de Cortex : les règles de l'espace et le dossier, ouverts au premier outil seulement,
     * pour qu'une réponse sans outil ne laisse pas de dossier vide.
     */
    private final class Kernel implements ToolStep {
        private final AgentContext ctx;
        private final String question;
        private final Map<String, Object> origin;
        private RulesBundle bundle;
        private UUID record;

        Kernel(AgentContext ctx, String question, Map<String, Object> origin) {
            this.ctx = ctx;
            this.question = question;
            this.origin = origin;
        }

        /** Tracer avant d'agir : la demande et la décision entrent au dossier avant tout effet. */
        @Override
        public ToolOutcome apply(AgentTool tool, String name, String argsJson) {
            String result;
            String status = "success";
            String shown = null;
            CortexGesture.Done done = null;
            try {
                CortexGate.Verdict verdict = judge(tool, argsJson);
                if (verdict.denied()) {
                    result = refusedText(verdict);
                    status = "refused";
                } else if (!verdict.allowed()) {
                    // Demandé : jamais exécuté par le modèle. Une écriture externe ne se propose qu'à qui peut la valider
                    // (propriétaire ou administrateur, OSS-1.5) ; les autres l'apprennent d'emblée.
                    if (tool instanceof ExternalMcpTool && !authorization.isManager(ctx.workspaceId(), ctx.userId())) {
                        result = "Not run: only workspace owners and admins can approve a change in an external "
                            + "tool. Tell the user that an owner or admin has to make this change.";
                        status = "error";
                    } else {
                        // La carte dit ce que la personne accorde : l'issue qu'on supprimerait, ce qui partirait avec elle.
                        done = preview(tool, argsJson);
                        result = done == null ? PROPOSED : done.text() + " " + PROPOSED;
                        status = "pending";
                    }
                } else if (PREPARED.contains(name)) {
                    // Avant la carte, ce que seule la personne peut dire : sinon une question, et aucune carte. La carte
                    // montre les arguments tels que le serveur les entend (« moi » : la personne qui demande).
                    AgentTool.Prepared prepared = tool.prepare(objectMapper.readValue(argsJson,
                        new TypeReference<Map<String, Object>>() {}), ctx);
                    if (prepared != null && prepared.asks()) {
                        result = prepared.question() + QUESTION_TEXT;
                        status = QUESTION;
                    } else {
                        result = PREPARED_TEXT;
                        status = "pending";
                        if (prepared != null && prepared.args() != null) shown = objectMapper.writeValueAsString(prepared.args());
                    }
                } else if (!doneAtOnce(name, verdict)) {
                    result = ASKED_TEXT;
                    status = "pending";
                } else {
                    Map<String, Object> args = objectMapper.readValue(argsJson, new TypeReference<Map<String, Object>>() {});
                    if (tool instanceof CortexGesture gesture) {
                        done = gesture.perform(args, ctx);
                        result = done.text();
                    } else {
                        result = tool.execute(args, ctx);
                    }
                }
            } catch (Exception e) {
                result = "Tool " + name + " failed: " + e.getMessage();
                status = "error";
                done = null;
            }
            String ref = result(name, status, result, done == null ? null : done.undo());
            return new ToolOutcome(status, result, shown, undoable(tool, status, done) ? ref : null,
                done == null ? null : done.target());
        }

        /** Ce que montre la carte d'un geste demandé ; null pour un autre outil, ou un geste sans rien de plus à montrer. */
        private CortexGesture.Done preview(AgentTool tool, String argsJson) throws JsonProcessingException {
            if (!(tool instanceof CortexGesture gesture)) return null;
            return gesture.preview(objectMapper.readValue(argsJson, new TypeReference<Map<String, Object>>() {}), ctx);
        }

        /** La demande, puis la décision des règles, au dossier avant tout effet : sans dossier, l'action ne part pas. */
        CortexGate.Verdict judge(AgentTool tool, String argsJson) {
            if (bundle == null) bundle = gate.rulesFor(ctx);
            if (record == null) record = records.open(ctx, question, withModel(origin));
            traceBefore(record, "action.requested", CortexRecordService.Actor.CORTEX,
                Map.of("tool", tool.name(), "arguments", CortexRecordService.shorten(argsJson)));
            CortexGate.Verdict verdict = gate.judge(bundle, tool);
            traceBefore(record, "action.decided", CortexRecordService.Actor.rule(verdict.ruleId()),
                Map.of("effect", verdict.effect(), "facts", verdict.facts()));
            return verdict;
        }

        /** Le résultat au dossier, s'il s'est ouvert, et son empreinte. */
        String result(String tool, String status, String output, Map<String, Object> undoData) {
            return record == null ? null : traceAfter(record, tool, status, output, undoData);
        }

        @Override
        public String recordRef() {
            return record == null ? null : record.toString();
        }

        /** Le modèle qui a répondu, connu dès le premier appel d'outil. */
        private Map<String, Object> withModel(Map<String, Object> origin) {
            Map<String, Object> withModel = new LinkedHashMap<>();
            withModel.put("model", llm.currentModel());
            withModel.putAll(origin);
            return withModel;
        }
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

    private String systemPrompt(List<KnowledgeNode> hits, List<AgentTool> external, LocalDate today) {
        StringBuilder sb = new StringBuilder();
        sb.append("You are Cortex, the AI copilot of a TaskForce workspace. Answer in the user's language, ")
          .append("concisely, grounded in the real context. ")
          .append("Use your tools only when they help: search the workspace's notes, list or create TaskForce ")
          .append("projects and issues, change, move, assign or comment an issue, hand it to an agent, write a note. ")
          .append("Never create anything the user did not ask for. ")
          .append("Say that you created, changed or deleted something only when a tool result in this conversation ")
          .append("confirms it; if no tool ran or a tool failed, say plainly that it was not done. ")
          .append("Never name your tools or describe your internal steps to the user. ")
          .append("If you need data from an external system you have no tool for, call find_integration: when ")
          .append("the integration exists but is not connected, invite the user to connect it (Settings > ")
          .append("Integrations); when it is not in the catalog, say so plainly and add that a tool with an MCP ")
          .append("server can still be connected there. Never make data up. ")
          .append("Today is ").append(today.format(TODAY)).append(" (UTC). ")
          .append("When the person asks for an issue, prepare it with create_issue: it becomes a card the person ")
          .append("checks, edits and creates. Fill only what the request or the project says: a title, a short ")
          .append("description, a checklist when the work has steps; a priority, an assignee (a member of the project), ")
          .append("labels (existing ones), points or a cycle (an existing one) only when the request or the project ")
          .append("gives them. Leave the rest empty: the person fills it on the card. Place it in time from its goal: ")
          .append("read the project's columns, active cycle, labels and members with list_projects, keep it in the ")
          .append("Backlog unless the work must start now, and set a due date only when the goal or the person gives ")
          .append("one. Ask one short question, with the choices, before preparing the card only when what matters is ")
          .append("unclear: the request does not say which project and there are several, or it names a person who ")
          .append("matches several members. Never ask about the other fields: they stay editable on the card. ")
          // Les gestes du MCP TaskForce (ADR-024, TF-J1-5) : faits d'emblée quand ils se défont, demandés sinon ; les
          // décisions restent aux boutons des cartes, jamais à un « oui » écrit (R1).
          .append("To change an existing issue (its title, description, priority, column, assignee, labels, points, cycle ")
          .append("or due date), call update_issue with its key (like TF-12) and only the fields to change: it is done ")
          .append("at once and the person can undo it. When the person names an issue by its column or its title rather ")
          .append("than its key, find its key first with list_issues, which filters by column. To comment on an issue, ")
          .append("call add_comment. To delete or archive an issue, call delete_issue: it never deletes on its own, its ")
          .append("card lets the person archive it (which can be undone) or delete it. Never prepare an issue to ask for ")
          .append("a deletion. To hand an issue to ")
          .append("Claude Code, call delegate_issue: the person approves it on its card. When the person asks where a ")
          .append("mission stands, what an agent asks or what it produced, call get_mission: its cards let the person ")
          .append("answer a request or decide on the result. Never decide for the person, and never say that a request ")
          .append("is answered or a result applied: only the buttons of the cards do that, even when the person writes yes. ");
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

    /**
     * Ce que dit la réponse quand un geste attend la personne sur sa carte. Sur la pile de dev, qwen3:8b montrait la carte
     * de suppression puis écrivait « Otherwise, I'll proceed with deletion », et « I have handed the issue to Claude
     * Code » avant tout accord (02/11/2026) : un « oui » écrit n'aurait rien fait (R1). La phrase est donc celle du
     * serveur, qui dit où décider.
     */
    static final Map<String, String> CARD_ANSWERS = Map.of(
        "delete_issue", "Nothing is deleted yet: choose on the card below. Archive hides the issue from the board and can "
            + "be undone; Delete removes it for good.",
        "delegate_issue", "Nothing is handed over yet: approve the mission on the card below, and Claude Code starts on "
            + "your runner.");

    static String cardAnswer(String answer, List<AssistantToolCall> toolCalls) {
        return toolCalls.stream()
            .filter(call -> "pending".equals(call.status()) && CARD_ANSWERS.containsKey(call.name()))
            .map(call -> CARD_ANSWERS.get(call.name()))
            .findFirst()
            .orElse(answer);
    }

    /** Le fournisseur a refusé les outils : rien n'a été fait, on le dit, avec les notes trouvées. */
    private static String toolsRefusedAnswer(List<KnowledgeNode> hits) {
        String warning = "> [!warning] Cortex could not act\n"
            + "> The AI provider refused the tools Cortex needs, so nothing was created or changed. Try again in a moment.";
        return hits.isEmpty() ? warning : notesList(hits) + "\n\n" + warning;
    }

    /** Réponse sans modèle : les notes trouvées par la recherche, et l'état de l'IA. */
    private static String fallbackAnswer(List<KnowledgeNode> hits) {
        return notesList(hits) + "\n\n> [!note] AI unavailable\n"
            + "> Generated answers, reasoning and actions need an AI provider: Ollama on this machine, "
            + "or any OpenAI-compatible API, configured on the AI service of the instance.";
    }

    /** Les notes trouvées par la recherche, en liens ; une phrase quand il n'y en a aucune. */
    private static String notesList(List<KnowledgeNode> hits) {
        if (hits.isEmpty()) return "I found no relevant note in your workspace for this request.";
        StringBuilder sb = new StringBuilder("Here are the most relevant notes of your workspace:\n\n");
        for (KnowledgeNode n : hits) {
            sb.append("- [[").append(n.getTitle()).append("]] (").append(n.getDomain()).append(")\n");
        }
        return sb.toString().stripTrailing();
    }
}
