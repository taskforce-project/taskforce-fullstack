package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.response.AssistantActionResult;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantChoice;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantQuestion;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantRead;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantRead.ContextRead;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantSource;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantStep;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantToolCall;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantUsage;
import com.taskforce.tf_api.core.dto.response.ChatTurnResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
import com.taskforce.tf_api.core.service.rules.RuleApprovers;
import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.security.DelegatedAgent;
import com.taskforce.tf_api.core.service.AiConversationService;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.LlmContext;
import com.taskforce.tf_api.core.service.LlmToolsRefusedException;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.agent.TurnInput.LastCard;
import com.taskforce.tf_api.core.service.agent.tools.ProjectResolver;
import com.taskforce.tf_api.core.service.ai.AttachedFile;
import com.taskforce.tf_api.core.service.ai.ContextBudget;
import com.taskforce.tf_api.core.service.ai.ModelFailure;
import com.taskforce.tf_api.core.service.ai.ModelWindow;
import com.taskforce.tf_api.core.service.ai.TurnHistory;
import com.taskforce.tf_api.core.service.ai.TurnStoppedException;
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
    private final RuleApprovers       approvers;
    private final CortexRecordService records;
    private final CortexUndo          undo;
    private final ScreenContext       screens;
    private final IssueMaterial       material;
    private final ProjectResolver     projects;
    private final AiConversationService conversations;

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

    /**
     * Ce qu'une demande apporte à la recherche dans les notes : ses deux bouts, assez pour la question d'un long texte
     * collé, où qu'elle soit, sans envoyer tout le texte au service de vecteurs ni à {@code to_tsquery}.
     */
    private static final int SEARCH_END = 2_000;

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
        // Une écriture par la connexion de la personne, elle l'accorde ; par une connexion partagée avec l'espace, un
        // propriétaire ou un administrateur (séance n°22, R154 ; OSS-1.5). Ses outils sont ceux de sa connexion.
        if (tool instanceof ExternalMcpTool external && !external.isReadOnly() && external.shared()
                && !authorization.isManager(ws.getId(), userId)) {
            throw new BusinessException("Only workspace owners and admins can approve a change through a connection "
                + "shared with the workspace.");
        }
        // Les règles du travail qui avait jugé la proposition (R157), relues : elles ont pu changer depuis. Le projet est
        // celui que le dossier a gardé, jamais celui que nomment les arguments ; un outil de TaskForce qui en nomme un
        // autre est jugé aussi avec ses règles, et la décision la plus stricte l'emporte.
        Long project = proposedProject(record, toolName);
        if (!records.approve(record, toolName, userId, argsJson)) {
            throw new BusinessException("This action is no longer waiting for your approval.");
        }
        CortexGate.Judged judged = gate.judgeWork(ctx, project, tool, argsJson, CortexGate.Exposure.none(),
            p -> gate.rulesFor(ctx, p));
        CortexGate.Verdict verdict = judged.verdict();
        traceBefore(record, "action.decided", CortexRecordService.Actor.rule(verdict.ruleId()),
            decidedData(verdict, judged.bundle(), project, judged.project()));
        String status = "success";
        String output;
        CortexGesture.Done done = null;
        try {
            if (verdict.denied()) {
                status = "refused";
                output = "Not run: the rules of this workspace refuse it. " + verdict.reason();
            } else if (!verdict.allowed() && !judged.aloneSuffices(approvers, ws.getId(), userId)) {
                // Une règle de l'entreprise demande l'accord d'autres personnes (R98) : la carte n'y suffit pas.
                status = "refused";
                output = waitsForOthers(verdict, ws.getId());
            } else {
                Map<String, Object> args = objectMapper.readValue(argsJson == null || argsJson.isBlank() ? "{}" : argsJson,
                    new TypeReference<Map<String, Object>>() {});
                // Ce que Cortex écrit sur l'accord de la personne garde le modèle qui l'a proposé, celui du dossier (R123).
                String model = records.model(record).orElse(null);
                AgentTool approved = tool;
                if (tool instanceof CortexGesture gesture) {
                    done = DelegatedAgent.withModel(model, () -> gesture.perform(args, ctx));
                    output = done.text();
                } else {
                    output = DelegatedAgent.withModel(model, () -> approved.execute(args, ctx));
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

    /**
     * Les réponses de la personne à une carte de TaskForce (R115, séance n°17), envoyées ensemble (décision du CEO,
     * 05/11/2026) : pour chaque question, les choix cochés ou la réponse tapée remplissent ce qu'elle demandait, puis le
     * geste reprend comme dans la réponse qui l'a posée, sans le modèle : rejugé par les règles de l'espace (elles ont pu
     * changer), gardé au même dossier, avec les droits de la personne. Ce sont ses clics et ses mots sur la carte, jamais
     * une décision lue dans un message (R1). Une carte ne se répond qu'une fois, et toutes ses questions à la fois. Le
     * geste peut alors poser les questions suivantes, montrer sa carte, ou se faire.
     */
    public AssistantToolCall answer(String slug, Long userId, String toolName, String recordRef, String ref,
                                    List<Question.Answer> answers) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        UUID record = recordId(recordRef);
        if (!records.owns(record, new AgentContext(slug, ws.getId(), userId))) {
            throw new ResourceNotFoundException("This conversation's record was not found.");
        }
        AgentTool tool = tools.get(toolName);
        if (tool == null) {
            throw new BusinessException("This action is no longer available.");
        }
        JsonNode asked = records.question(record, toolName, ref)
            .orElseThrow(() -> new BusinessException("This question is already answered."));
        ObjectNode args;
        try {
            JsonNode before = objectMapper.readTree(asked.path("arguments").asText("{}"));
            args = before.isObject() ? (ObjectNode) before : objectMapper.createObjectNode();
        } catch (JsonProcessingException e) {
            throw new BusinessException("The arguments of this action are not readable.");
        }
        // Tout se juge avant d'entrer au dossier : une réponse refusée laisse la carte ouverte, à corriger.
        List<Question> questions = questionsOf(asked);
        Map<String, String> said = filled(args, questions, answers == null ? List.of() : answers);
        markAnswered(args, questions);
        records.answer(record, toolName, ref, userId, said)
            .orElseThrow(() -> new BusinessException("This question is already answered."));
        JsonNode where = asked.path("screen");
        AgentContext ctx = new AgentContext(slug, ws.getId(), userId,
            new Screen(longOrNull(where.path("projectId")), longOrNull(where.path("issueId"))));
        String argsJson = args.toString();
        ToolOutcome outcome = new Kernel(ctx, record).apply(tool, toolName, argsJson);
        // Le projet que la personne vient de choisir sur la carte devient celui de sa conversation (R135) : la rangée le
        // montre, et la question ne revient pas au geste suivant.
        if (said.containsKey(ProjectResolver.FIELD) && "pending".equals(outcome.status())) {
            adoptProject(asked.path("conversation"), said.get(ProjectResolver.FIELD), ws.getId(), ctx);
        }
        String shown = outcome.input() != null ? outcome.input() : argsJson;
        return new AssistantToolCall(toolName, outcome.status(), shown, outcome.result(), record.toString(), outcome.ref(),
            outcome.target(), card(outcome.questions()));
    }

    private void adoptProject(JsonNode conversation, String project, Long workspaceId, AgentContext ctx) {
        Long conversationId = longOrNull(conversation);
        if (conversationId == null) return;
        ProjectResolver.Resolution where = projects.resolve(project, ctx);
        if (where.found()) conversations.setProject(conversationId, ctx.userId(), workspaceId, where.project().getId());
    }

    /**
     * Les questions de la carte gardées au dossier ; une carte d'avant le 05/11/2026 n'en a qu'une, sous {@code question},
     * sans titre ni lignes qui disent ses choix.
     */
    private List<Question> questionsOf(JsonNode asked) {
        List<Question> questions = new ArrayList<>();
        JsonNode kept = asked.path("questions").isArray() ? asked.path("questions")
            : objectMapper.createArrayNode().add(asked.path("question"));
        for (JsonNode question : kept) {
            if (question.isObject()) questions.add(objectMapper.convertValue(question, Question.class));
        }
        if (questions.isEmpty()) throw new BusinessException("This question can't be read anymore: ask again.");
        return questions;
    }

    /**
     * Remplit les arguments du geste avec les réponses de la carte, et rend ce que chacune dit, pour le dossier. Chaque
     * question a sa réponse : un choix coché, ou la réponse tapée, pour une question à un seul choix ; des choix cochés et
     * la réponse tapée (ses parties séparées par des virgules) pour une question dont plusieurs se cochent, qui remplit
     * une liste. Un choix coché est un choix de la question ; une réponse tapée se lit parmi les choix ({@link #chosen}).
     */
    static Map<String, String> filled(ObjectNode args, List<Question> questions, List<Question.Answer> answers) {
        Map<String, Question.Answer> byField = new LinkedHashMap<>();
        for (Question.Answer answer : answers) {
            boolean asked = questions.stream().anyMatch(question -> question.field().equals(answer.field()));
            if (!asked || byField.putIfAbsent(answer.field(), answer) != null) {
                throw new BusinessException("This card has no other question to answer.");
            }
        }
        Map<String, String> said = new LinkedHashMap<>();
        for (Question question : questions) {
            Question.Answer answer = byField.get(question.field());
            String named = question.header() == null || question.header().isBlank() ? "this question" : question.header();
            if (answer == null || (answer.values().isEmpty() && answer.other().isEmpty())) {
                throw new BusinessException("Answer " + named + ": pick one of the choices, or write your answer.");
            }
            for (String value : answer.values()) {
                if (question.choices().stream().noneMatch(choice -> choice.value().equals(value))) {
                    throw new BusinessException("\"" + clipped(value, 40) + "\" isn't a choice of " + named
                        + ": write it as your own answer.");
                }
            }
            if (!question.multiple()) {
                if (answer.values().size() + (answer.other().isEmpty() ? 0 : 1) > 1) {
                    throw new BusinessException("Pick one answer for " + named + ".");
                }
                String value = answer.other().isEmpty() ? answer.values().get(0) : chosen(question, answer.other());
                args.put(question.field(), value);
                said.put(question.field(), value);
            } else {
                List<String> values = new ArrayList<>(answer.values());
                for (String part : answer.other().split(",")) {
                    if (!part.isBlank()) values.add(chosen(question, part.strip()));
                }
                List<String> kept = values.stream().distinct().toList();
                ArrayNode list = args.putArray(question.field());
                kept.forEach(list::add);
                said.put(question.field(), String.join(", ", kept));
            }
        }
        return said;
    }

    /**
     * Note dans les arguments les questions auxquelles la personne vient de répondre ({@link Question#ANSWERED}), après
     * celles des cartes d'avant : le geste qui reprend ne redemande pas ce qu'elle a dit, et sait qu'une carte a déjà été
     * montrée (test du CEO du 05/11/2026).
     */
    static void markAnswered(ObjectNode args, List<Question> questions) {
        JsonNode before = args.get(Question.ANSWERED);
        ArrayNode answered = JsonNodeFactory.instance.arrayNode();
        // Les questions déjà notées, en textes ; une valeur d'une autre forme ne compte pas.
        if (before != null && before.isArray()) {
            before.forEach(field -> {
                if (field.isTextual()) answered.add(field.asText());
            });
        }
        questions.forEach(question -> answered.add(question.field()));
        args.set(Question.ANSWERED, answered);
    }

    /**
     * Ce que reçoit le geste d'une réponse tapée : lue parmi les choix (« testta-2 », « le login », « todo » : la valeur,
     * le libellé, ou le seul choix dont le libellé ou la ligne qui le dit la contient). Sinon, la réponse telle qu'elle
     * est écrite : le geste la juge.
     */
    static String chosen(Question question, String said) {
        for (Question.Choice choice : question.choices()) {
            if (said.equalsIgnoreCase(choice.value()) || said.equalsIgnoreCase(choice.label())) return choice.value();
        }
        String wanted = said.toLowerCase(Locale.ROOT);
        List<Question.Choice> containing = wanted.length() < 2 ? List.of() : question.choices().stream()
            .filter(choice -> choice.label().toLowerCase(Locale.ROOT).contains(wanted)
                || (choice.description() != null && choice.description().toLowerCase(Locale.ROOT).contains(wanted)))
            .toList();
        return containing.size() == 1 ? containing.get(0).value() : said;
    }

    private static Long longOrNull(JsonNode node) {
        return node != null && node.canConvertToLong() && !node.isNull() ? node.asLong() : null;
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
        return run(slug, userId, message, history, Screen.NONE);
    }

    /**
     * Avec ce que la personne voit à l'écran (R114, séance n°17) : le modèle le lit avant les notes, et un geste qui doit
     * demander quelle issue propose d'abord celles de l'écran (R115).
     */
    public AssistantAnswer run(String slug, Long userId, String message, List<Map<String, Object>> history, Screen screen) {
        return run(slug, userId, message, TurnHistory.of(history == null ? List.of() : history), screen, List.of());
    }

    /**
     * Avec ce que la personne a joint à sa demande depuis le compositeur (R123, séance n°18) : une issue
     * ({@code issueId} posé) que TaskForce lit comme avant un résumé, ou un projet dont il montre le tableau comme
     * l'écran. Chaque lecture passe par les droits de la personne ; ce qu'elle ne voit pas ne se lit pas. {@code memory}
     * donne l'historique que le budget de la requête laisse partir (TF-J1-13), une fois la requête construite.
     */
    public AssistantAnswer run(String slug, Long userId, String message, TurnHistory memory, Screen screen,
                               List<Screen> attached) {
        return run(slug, userId, new TurnInput(message, memory, screen, attached, List.of(), null, null, null));
    }

    /**
     * Un tour tel que le compositeur l'envoie (R134, R135) : avec le projet de la conversation, que les gestes prennent
     * quand la demande n'en nomme pas, et les fichiers joints, comptés comme ce qui est joint. La personne peut l'arrêter :
     * ce qui a tourné est compté, et la réponse le dit.
     */
    public AssistantAnswer run(String slug, Long userId, TurnInput input) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        String message = input.message();
        TurnHistory memory = input.memory();
        List<Screen> attached = input.attached();
        AgentContext ctx = new AgentContext(slug, ws.getId(), userId, input.screen(), message, projectOf(input),
            input.conversation());

        // « Tu t'es trompé de projet », après une carte : le choix du projet, sans le modèle (R135).
        AssistantAnswer corrected = input.lastCard() == null ? null : correctProject(ws.getId(), ctx, message, input.lastCard());
        if (corrected != null) return corrected;

        // Salutation ou remerciement : réponse directe, sans recherche (pas de sources hors sujet). Ce qui est joint se lit.
        if (isConversational(message) && attached.isEmpty() && input.files().isEmpty()) {
            return runConversational(ws.getId(), message, memory);
        }

        long startedAt = System.nanoTime();
        // ── Recherche (RAG), réelle avec ou sans IA, dans les notes que la personne lit ──
        TurnProgress.say(TurnProgress.NOTES);
        List<KnowledgeNode> hits = search.retrieveRelevant(access.viewer(ws.getId(), userId), searchQuery(message), 5);
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
        // Ce que TaskForce donne à lire au modèle, compté à mesure : la ligne grise sous la réponse (R123).
        Reading reading = new Reading(hits);
        try {
            steps.add(new AssistantStep(STEP_ANSWER, "active", "Cortex answers, with its tools if needed"));
            // Un geste qui se demande parle par sa carte : la phrase du modèle ne dit pas « je supprime » à sa place.
            String modelAnswer = cardAnswer(runToolLoop(message, hits, ctx, toolCalls, memory, attached, input.files(), reading), toolCalls);
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
            // La question d'un geste se reconnaît à sa marque (R115) : la carte la montre à sa place ; et quand Cortex n'a
            // rien dit (qwen3:8b, souvent, après une demande de suppression), ce qui s'est passé se dit à sa place.
            String asked = askedAnswer(checked.answer(), toolCalls);
            String answer = silentAnswer(asked, toolCalls, llm.currentModel());
            if (!answer.equals(asked)) {
                steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "done", "Cortex said nothing: what happened was said instead"));
            }
            // Toute réponse d'un modèle a son dossier : « bien » et « pas bien » en font un cas (R137, R61).
            if (record == null) record = recordForTheBank(ctx, message, hits);
            LlmUsage usage = llm.currentUsage();
            recordUsage(ws.getId(), usage);
            return new AssistantAnswer(answer, null, toolCalls.isEmpty() ? "fast" : "deep",
                sources, steps, toolCalls, usage(usage), record, llm.currentModel(),
                reading.read(toolCalls, record, startedAt));
        } catch (TurnStoppedException stopped) {
            return stoppedByPerson(ws.getId(), steps, sources, toolCalls, reading);
        } catch (TooBig tooBig) {
            log.info("Cortex (ws={}) : une demande d'environ {} jetons ne tient pas la fenêtre de {} ({})", ws.getId(),
                tooBig.budget.fixed(), LogSafe.of(tooBig.budget.window().model()), tooBig.budget.window().tokens());
            LlmUsage usage = llm.currentUsage();
            recordUsage(ws.getId(), usage);
            steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error", TOO_BIG_STEP));
            return tooBigAnswer(tooBig, sources, steps, usage(usage));
        } catch (LlmToolsRefusedException ex) {
            log.warn("Cortex (slug={}) : le fournisseur refuse les outils", LogSafe.of(slug));
            LlmUsage usage = llm.currentUsage();
            recordUsage(ws.getId(), usage);
            if (!toolCalls.isEmpty()) {
                return stopped(steps, sources, toolCalls, usage(usage), llm.currentModel(), "The AI provider refused Cortex's tools.")
                    .withRead(reading.read(toolCalls, null, startedAt));
            }
            steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error",
                "The AI provider refused Cortex's tools: nothing was done"));
            return new AssistantAnswer(toolsRefusedAnswer(hits), null, "fallback", sources, steps, List.of(), usage(usage));
        } catch (Exception ex) {
            log.warn("Agent LLM indisponible (slug={}): {}", LogSafe.of(slug), LogSafe.of(ex.getMessage()));
            LlmUsage usage = llm.currentUsage(); // usage partiel réel (appels déjà faits avant l'échec)
            recordUsage(ws.getId(), usage);
            // Ce qui s'est vraiment passé, et quoi faire (TF-J1-15) : un délai dépassé n'est pas une IA absente.
            ModelFailure failure = ModelFailure.of(ex);
            if (!toolCalls.isEmpty()) {
                return stopped(steps, sources, toolCalls, usage(usage), llm.currentModel(), failure.said())
                    .withRead(reading.read(toolCalls, null, startedAt));
            }
            steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error", failure.said()));
            return new AssistantAnswer(signed(ABOUT_MODELS, List.of(failure.said())), null, "fallback", sources, steps, List.of(), usage(usage));
        } finally {
            llm.endUsageCapture();
        }
    }

    /** Le projet de ce tour : celui que la personne a joint à sa demande, quand il n'y en a qu'un, sinon celui de la conversation. */
    private static Long projectOf(TurnInput input) {
        List<Long> joined = input.attached().stream().filter(item -> item.issueId() == null && item.projectId() != null)
            .map(Screen::projectId).distinct().toList();
        return joined.size() == 1 ? joined.get(0) : input.project();
    }

    /** Le mode d'un tour que la personne a arrêtée (R134) : la conversation le relit comme tel. */
    public static final String STOPPED_MODE = "stopped";
    private static final String STOPPED_TEXT = "Stopped by you.";
    private static final String STOPPED_AFTER_WORK = STOPPED_TEXT + " What Cortex had already done shows below: check it "
        + "before asking again, so nothing is done twice.";

    /**
     * La personne a arrêté le tour (R134) : la réponse le dit, ce qui a déjà été fait reste montré, et ce qui a tourné compte
     * dans son usage.
     */
    private AssistantAnswer stoppedByPerson(Long workspaceId, List<AssistantStep> steps, List<AssistantSource> sources,
                                            List<AssistantToolCall> toolCalls, Reading reading) {
        LlmUsage usage = llm.currentUsage();
        recordUsage(workspaceId, usage);
        if (!steps.isEmpty()) steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "done", "Stopped by you"));
        String record = toolCalls.stream().map(AssistantToolCall::record).filter(Objects::nonNull).findFirst().orElse(null);
        return new AssistantAnswer(toolCalls.isEmpty() ? STOPPED_TEXT : STOPPED_AFTER_WORK, null, STOPPED_MODE, sources, steps,
            toolCalls, usage(usage), record, llm.currentModel(), reading.read());
    }

    /**
     * « Tu t'es trompé de projet », après une carte (R135 ; l'étape 15 de la recette : la même carte revenait, avec une
     * description inventée) : la carte de questions, avec les projets en choix, sur les arguments de la carte, sans passer
     * par le modèle. Quand la phrase nomme un autre projet, la carte y est refaite tout de suite. Null quand la phrase n'en
     * dit rien, ou qu'il n'y a qu'un projet à proposer : le tour continue comme d'habitude.
     */
    private AssistantAnswer correctProject(Long workspaceId, AgentContext ctx, String message, LastCard last) {
        if (!ProjectCorrection.asks(message)) return null;
        AgentTool tool = tools.get(last.tool());
        if (tool == null) return null;
        ObjectNode args = arguments(last.input());
        String was = args.path(ProjectResolver.FIELD).asText("");
        args.remove(ProjectResolver.FIELD);
        args.remove(Question.ANSWERED);
        Kernel kernel = new Kernel(ctx, message, origin(null, List.of()));
        ToolOutcome outcome;
        Optional<ProjectResponse> written = projects.writtenIn(ctx).filter(project -> !project.getIdentifier().equalsIgnoreCase(was));
        if (written.isPresent()) {
            args.put(ProjectResolver.FIELD, written.get().getIdentifier());
            outcome = kernel.apply(tool, last.tool(), args.toString());
            if ("pending".equals(outcome.status()) && ctx.conversation() != null) {
                conversations.setProject(ctx.conversation(), ctx.userId(), workspaceId, written.get().getId());
            }
        } else {
            Optional<Question> question = projects.whichProject(args.path("title").asText(""), ctx);
            if (question.isEmpty()) return null;
            outcome = kernel.asks(tool, last.tool(), args.toString(), List.of(question.get()));
        }
        String shown = outcome.input() != null ? outcome.input() : args.toString();
        List<AssistantToolCall> calls = List.of(new AssistantToolCall(last.tool(), outcome.status(), shown, outcome.result(),
            kernel.recordRef(), outcome.ref(), outcome.target(), card(outcome.questions())));
        String text;
        if (outcome.questions() != null) {
            text = askedAnswer(asking(outcome.questions()), calls);
        } else if ("pending".equals(outcome.status()) && written.isPresent()) {
            text = "The card is ready in " + written.get().getName() + ": check it, then create it.";
        } else {
            text = silentAnswer("", calls, llm.currentModel());
        }
        return new AssistantAnswer(text, null, "deep", List.of(), List.of(), calls, AssistantUsage.NONE, kernel.recordRef());
    }

    /** Les arguments gardés d'une carte, ou rien de lisible : un objet vide. */
    private ObjectNode arguments(String input) {
        try {
            JsonNode read = objectMapper.readTree(input == null || input.isBlank() ? "{}" : input);
            return read.isObject() ? (ObjectNode) read : objectMapper.createObjectNode();
        } catch (JsonProcessingException unreadable) {
            return objectMapper.createObjectNode();
        }
    }

    /**
     * Arrêt en cours de route, après des appels d'outils : ce qui a été fait reste dans la réponse, avec ses étapes, pour
     * que la personne le voie et ne le redemande pas (une issue déjà créée ne doit pas passer pour « rien n'a été fait »).
     */
    private static AssistantAnswer stopped(List<AssistantStep> steps, List<AssistantSource> sources,
                                           List<AssistantToolCall> toolCalls, AssistantUsage usage, String model,
                                           String cause) {
        steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error", cause));
        String answer = "> [!warning] Cortex stopped before the end\n> " + cause
            + " What it had already done shows above: check it before asking again, so nothing is done twice.";
        return new AssistantAnswer(answer, null, "deep", sources, steps, toolCalls, usage, null, model);
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

    /**
     * Le dossier d'une réponse sans outil, ouvert quand elle est écrite : la question, le modèle et les notes servies, de
     * quoi en faire un cas de la banque. Une panne du dossier ne touche pas la réponse : elle se journalise, et ses gestes
     * « bien » et « pas bien » ne se montrent pas.
     */
    private String recordForTheBank(AgentContext ctx, String message, List<KnowledgeNode> hits) {
        try {
            Map<String, Object> origin = new LinkedHashMap<>();
            origin.put("model", llm.currentModel());
            origin.putAll(origin(null, hits));
            UUID record = records.open(ctx, message, origin);
            return record == null ? null : record.toString();
        } catch (RuntimeException e) {
            log.warn("Cortex : dossier de la réponse non ouvert : {}", LogSafe.of(e.getMessage()));
            return null;
        }
    }

    /** Ce que la recherche lit d'une demande : toute la demande, ou ses deux bouts quand c'est un long texte collé. */
    static String searchQuery(String message) {
        if (message == null || message.length() <= SEARCH_END * 2) return message;
        return message.substring(0, SEARCH_END) + " " + message.substring(message.length() - SEARCH_END);
    }

    /** Détail de l'étape de réponse une fois terminée : outils mobilisés, s'il y en a eu. */
    private static String toolsDescription(List<AssistantToolCall> toolCalls) {
        String used = toolCalls.stream().map(AssistantToolCall::name).distinct().collect(Collectors.joining(", "));
        return used.isEmpty() ? "Answered directly (no tool needed)" : "Tools: " + used;
    }

    /**
     * L'usage du tour, et ce que le modèle a lu à son dernier appel : la taille de ce prompt et sa fenêtre, connue ou
     * estimée, que la jauge de contexte compare (test du CEO du 05/11/2026).
     */
    private AssistantUsage usage(LlmUsage u) {
        if (u == null) return AssistantUsage.NONE; // garde défensive (mocks)
        LlmContext last = llm.currentContext();
        return new AssistantUsage(u.promptTokens(), u.completionTokens(), u.totalTokens(),
            last == null ? 0 : last.promptTokens(), last == null ? null : last.window(), last != null && last.estimated());
    }

    // -------------------------------------------------------------------------
    // Le contexte selon le modèle (TF-J1-13) : le budget de la requête, et une demande qui ne le tient pas
    // -------------------------------------------------------------------------

    /** Une demande qui ne tient pas la fenêtre de son modèle, même sans historique : rien ne part. */
    private static final class TooBig extends RuntimeException {
        private final transient ContextBudget budget;
        private final String tier;

        TooBig(ContextBudget budget, String tier) {
            super("Too big for the context window", null, false, false);
            this.budget = budget;
            this.tier = tier;
        }
    }

    private static final String TOO_BIG_STEP = "Too big for this model: nothing was sent";
    /** La signature de TaskForce quand il parle du modèle qui répond : ce n'est pas une correction (R116). */
    private static final String ABOUT_MODELS = ActionClaimCheck.SIGNATURE + " · models";

    /** Le budget de cette requête, contre la fenêtre du modèle de son palier. */
    private ContextBudget budget(String tier, String system, List<Map<String, Object>> toolDefs, String attached, String message) {
        ModelWindow window = llm.contextWindow(tier);
        int whole = ContextBudget.tokensOf(objectMapper, Map.of("role", "system", "content", system));
        int joined = attached == null || attached.isBlank() ? 0 : ContextBudget.tokens(attached);
        return new ContextBudget(window == null ? ModelWindow.UNBOUNDED : window, Math.max(0, whole - joined),
            toolDefs.isEmpty() ? 0 : ContextBudget.tokensOf(objectMapper, toolDefs), joined,
            ContextBudget.tokensOf(objectMapper, Map.of("role", "user", "content", message)));
    }

    /**
     * Ce qui part à chaque demande, quelle que soit la conversation : les consignes et les outils de Cortex. Avec ce qu'il
     * reste de l'historique, la jauge sait, sans attendre la prochaine réponse, où en est la conversation après une
     * compaction (TF-J1-15).
     */
    public int baselineTokens() {
        String system = systemPrompt(null, "", List.of(), List.of(), LocalDate.now(ZoneOffset.UTC));
        return ContextBudget.tokensOf(objectMapper, Map.of("role", "system", "content", system))
            + ContextBudget.tokensOf(objectMapper, tools.toolDefinitions(List.of()));
    }

    /**
     * Ce que TaskForce dit quand une demande ne tient pas (décision de la Présidence du 08/11/2026) : la réponse est la
     * sienne, sans modèle ; elle dit la taille et la fenêtre, et propose un modèle servi qui la tient, s'il y en a un.
     */
    private AssistantAnswer tooBigAnswer(TooBig tooBig, List<AssistantSource> sources, List<AssistantStep> steps,
                                         AssistantUsage usage) {
        ContextBudget budget = tooBig.budget;
        ModelWindow window = budget.window();
        // La taille qui compte pour la personne, sa réponse comprise : sans elle, « 3 995 jetons pour une fenêtre de 4 096 »
        // se lirait comme tenant.
        String text = "This request needs about " + number(budget.fixed() + window.answerRoom()) + " tokens with its answer, and "
            + window.model() + "'s context window is " + (window.estimated() ? "about " : "") + number(window.tokens())
            + ", so it wasn't sent. Shorten it, or send only the part that matters.";
        ChatTurnResponse.Escalation offer = llm.largerWindow(tooBig.tier, budget.fixed())
            .map(larger -> new ChatTurnResponse.Escalation(Capability.CONTEXT.key(), window.model(), larger.model(),
                larger.model() + "'s context window is " + number(larger.tokens()) + ". You can send this request to "
                    + larger.model() + "."))
            .orElse(null);
        return new AssistantAnswer(signed(ABOUT_MODELS, List.of(text)), null, AssistantAnswer.NOT_SENT, sources, steps, List.of(), usage,
            null, null, null, offer);
    }

    private static String number(int tokens) {
        return String.format(Locale.ENGLISH, "%,d", tokens);
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

    private static final int MAX_SMALLTALK = 200;

    private static final Set<String> SMALLTALK = Set.of(
        "hello", "hi", "hey", "yo", "thanks", "thank you", "thx", "ok", "okay", "yes", "no", "cool",
        "great", "perfect", "nice", "bye", "good morning", "good evening", "good night", "how are you",
        "what's up", "whats up",
        "bonjour", "salut", "coucou", "bonsoir", "merci", "merci beaucoup", "d'accord", "oui", "non",
        "super", "parfait", "top", "au revoir", "ça va", "ca va", "comment ça va", "comment ca va");

    /** Salutation ou remerciement pur : on retire une salutation de tête éventuelle, puis on compare. */
    static boolean isConversational(String message) {
        // Avant les expressions : un long texte collé n'est pas une salutation, et elles n'ont pas à le parcourir.
        if (message == null || message.length() > MAX_SMALLTALK) return false;
        String m = message.trim().toLowerCase()
            .replaceAll("[!?.,;:]+$", "").trim()
            .replaceAll("\\s+", " ");
        if (m.isEmpty() || m.length() > 40) return false;
        if (SMALLTALK.contains(m)) return true;
        String core = m.replaceFirst("^(hello|hi|hey|yo|bonjour|salut|coucou|bonsoir)\\b[\\s,!]*", "").trim();
        return core.isEmpty() || SMALLTALK.contains(core);
    }

    private AssistantAnswer runConversational(Long workspaceId, String message, TurnHistory memory) {
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
            TurnProgress.say(TurnProgress.WRITING);
            steps.add(new AssistantStep(STEP_ANSWER, "active", "Cortex answers"));
            Reading reading = new Reading(List.of());
            ContextBudget budget = budget("fast", CONVERSATIONAL_PROMPT, List.of(), "", message);
            TurnHistory.Fitted fitted = memory.fit(budget, "fast");
            reading.fitted(fitted);
            String answer = llm.chat(withHistory(CONVERSATIONAL_PROMPT, fitted.messages(), message), "fast");
            steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "done", "Answered directly"));
            LlmUsage usage = llm.currentUsage();
            recordUsage(workspaceId, usage);
            // Une salutation : le modèle n'a rien lu de l'espace, et la ligne grise le dit (R123).
            return new AssistantAnswer(answer, null, "fast", List.of(), steps, List.of(), usage(usage), null, llm.currentModel(),
                reading.read());
        } catch (TurnStoppedException stopped) {
            return stoppedByPerson(workspaceId, steps, List.of(), List.of(), new Reading(List.of()));
        } catch (Exception ex) {
            log.warn("Cortex (conversation) indisponible : {}", ex.getMessage());
            ModelFailure failure = ModelFailure.of(ex);
            steps.set(steps.size() - 1, new AssistantStep(STEP_ANSWER, "error", failure.said()));
            LlmUsage usage = llm.currentUsage();
            recordUsage(workspaceId, usage);
            return new AssistantAnswer(signed(ABOUT_MODELS, List.of(failure.said())), null, "fallback", List.of(), steps, List.of(), usage(usage));
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
                               List<AssistantToolCall> toolCalls, TurnHistory memory,
                               List<Screen> attached, List<AttachedFile> files, Reading reading) {
        // Outils externes (serveurs MCP connectés sur le workspace), découverts par requête et bornés par
        // pertinence avant l'envoi : un gros serveur MCP envoyé en entier sature un petit modèle.
        List<AgentTool> external = relevantExternal(workspaceMcp.toolsFor(ctx), message);
        if (!external.isEmpty()) {
            log.info("Cortex (ws={}) : {} outil(s) interne(s) + {} externe(s) MCP {}",
                ctx.workspaceId(), tools.all().size(), external.size(),
                external.stream().map(AgentTool::name).toList());
        }

        // L'écran (R114) et le plan de la demande (R117), choisis par TaskForce avant le modèle : il n'a rien à deviner.
        ScreenContext.Seen onScreen = ctx.screen().isEmpty() ? null : screens.read(ctx);
        String screen = onScreen == null || onScreen.isEmpty() ? "" : onScreen.text();
        if (onScreen != null && !onScreen.isEmpty()) reading.board(onScreen);
        // Ce que la personne a joint (R123) : le tableau d'un projet, lu comme l'écran ; une issue, lue comme avant un
        // résumé. Le projet de l'écran n'est pas relu.
        List<Screen> joined = attached == null ? List.of() : attached;
        List<String> boards = new ArrayList<>();
        joined.stream().filter(item -> item.issueId() == null && item.projectId() != null)
            .map(Screen::projectId).distinct()
            .filter(projectId -> !projectId.equals(ctx.screen().projectId()))
            .limit(IssueMaterial.MAX_ATTACHED)
            .forEach(projectId -> {
                ScreenContext.Seen board = screens.attached(ctx, projectId);
                if (board != null && !board.isEmpty()) {
                    boards.add(board.text().strip());
                    reading.board(board);
                }
            });
        CortexPlans.Plan plan = CortexPlans.forRequest(message).orElse(null);
        // Résumer une issue : TaskForce la lit et la donne au modèle avant qu'il écrive, au lieu d'espérer qu'il la lise
        // (test du CEO du 05/11/2026 : qwen3:8b commentait OPS-35 avec ce qu'elle ne dit pas). Une issue jointe se lit
        // aussi, résumé ou non.
        boolean summarize = plan != null && CortexPlans.SUMMARIZE.equals(plan.id());
        boolean anyIssue = joined.stream().anyMatch(item -> item.issueId() != null);
        IssueMaterial.Read read = summarize || anyIssue ? material.read(ctx, message, joined, summarize) : null;
        String issue = read == null || read.isEmpty() ? "" : read.text();
        if (read != null) reading.issues(read.issues());
        String seen = issue.isEmpty() ? screen : screen.isEmpty() ? issue : screen.strip() + "\n\n" + issue;
        if (!boards.isEmpty()) {
            List<String> blocks = new ArrayList<>();
            if (!screen.isEmpty()) blocks.add(screen.strip());
            blocks.addAll(boards);
            if (!issue.isEmpty()) blocks.add(issue.strip());
            seen = String.join("\n\n", blocks) + "\n";
        }
        // Les fichiers joints (R134) sont lus comme le reste de ce qui est joint : le budget les compte, la ligne grise aussi.
        String joinedFiles = AttachedFile.block(files);
        if (!joinedFiles.isEmpty()) {
            seen = seen.isEmpty() ? joinedFiles : seen.strip() + "\n\n" + joinedFiles;
            files.forEach(file -> reading.file(file.name()));
        }
        // Où travaille la conversation (R135), dit au modèle ; l'écran le renseigne, ce projet-ci décide.
        String workingIn = ctx.project() == null ? "" : screens.conversationProject(ctx);
        if (workingIn != null && !workingIn.isBlank()) seen = workingIn.strip() + (seen.isEmpty() ? "\n" : "\n\n" + seen);
        String system = systemPrompt(plan, seen, hits, external, LocalDate.now(ZoneOffset.UTC));
        List<Map<String, Object>> toolDefs = tools.toolDefinitions(external);
        String tier = external.isEmpty() ? "fast" : mcpToolTier;
        // Le budget de la requête, contre la fenêtre de son modèle (TF-J1-13) : ce qui ne tient pas ne part pas, et
        // l'historique ne prend que ce qu'il reste.
        ContextBudget budget = budget(tier, system, toolDefs, seen, message);
        if (!budget.fits()) throw new TooBig(budget, tier);
        TurnHistory.Fitted fitted = memory.fit(budget, tier);
        reading.fitted(fitted);
        List<Map<String, Object>> messages = withHistory(system, fitted.messages(), message);
        ToolLoopFit loopFit = new ToolLoopFit(objectMapper, budget, fitted.messages().size());
        reading.watch(loopFit);
        // Le noyau (R35) : les règles de l'espace et le dossier de la réponse, ouverts au premier outil. Le dossier garde
        // ce que le modèle a vu de l'écran et le plan qu'il a reçu.
        Map<String, Object> origin = origin(tier, hits);
        if (!screen.isEmpty()) origin.put("screen", screen);
        if (!boards.isEmpty()) origin.put("attached", CortexRecordService.shorten(String.join("\n\n", boards)));
        if (!issue.isEmpty()) origin.put("issue", CortexRecordService.shorten(issue));
        if (!files.isEmpty()) origin.put("files", files.stream().map(AttachedFile::name).toList());
        if (plan != null) origin.put("plan", plan.id());
        // Une issue importée d'un outil de l'entreprise sous les yeux de la réponse (séance n°22, R158) : un contenu du
        // dehors, que le socle compte avant une écriture ou une sortie, et que le dossier garde.
        if (gate.importedInView(ctx, joined, read == null ? List.of() : read.ids())) origin.put(CortexGate.IMPORTED, true);
        Kernel kernel = new Kernel(ctx, message, origin);
        String answer = toolLoop(messages, toolDefs, external, toolCalls, (msgs, defs) -> llm.rawChat(msgs, defs, tier), kernel,
            reading, loopFit);
        // Le geste du plan, quand Cortex ne l'a pas fait et que rien n'attend déjà la personne (une carte, une question).
        boolean gestureMade = plan != null && toolCalls.stream().anyMatch(call -> call.name().equals(plan.ask())
            || QUESTION.equals(call.status()) || "pending".equals(call.status()));
        return plan != null && plan.ask() != null && !gestureMade ? askedForCortex(plan.ask(), kernel, toolCalls, answer)
            : answer;
    }

    /**
     * La demande appelle un geste que Cortex n'a pas fait : à « supprime ça », qwen3:8b répond « dites-moi laquelle »
     * sans outil (04/11/2026), ou lit les issues sans rien proposer. TaskForce fait alors lui-même ce geste, sur la
     * demande de la personne (R115) : quand elle désigne l'issue (sa colonne, pour supprimer), sa carte, qui ne fait rien
     * avant le clic ; sinon ce que le geste exige, avec l'écran en choix, au dossier de la réponse. Sans carte ni
     * question, la réponse de Cortex reste.
     */
    private String askedForCortex(String name, Kernel kernel, List<AssistantToolCall> toolCalls, String answer) {
        AgentTool gesture = tools.get(name);
        if (!(gesture instanceof CortexGesture)) return answer;
        ToolOutcome outcome = kernel.apply(gesture, name, "{}");
        String input = outcome.input() != null ? outcome.input() : "{}";
        if (outcome.questions() == null) {
            // Le geste a trouvé ce qu'il lui faut : sa carte attend la personne, la réponse dit où décider (cardAnswer).
            if (!"pending".equals(outcome.status()) || outcome.target() == null) return answer;
            toolCalls.add(new AssistantToolCall(name, outcome.status(), input, outcome.result(), kernel.recordRef(),
                outcome.ref(), outcome.target()));
            return answer;
        }
        toolCalls.add(new AssistantToolCall(name, outcome.status(), input, outcome.result(), kernel.recordRef(), outcome.ref(),
            outcome.target(), card(outcome.questions())));
        return asking(outcome.questions());
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
        // Le plan de la question, comme dans une réponse (R117) : la banque dit s'il est suivi.
        List<Map<String, Object>> messages = withHistory(systemPrompt(CortexPlans.forRequest(replayCase.question()).orElse(null),
            "", notes, List.of(), replayCase.askedOn()), List.of(), replayCase.question());
        ReplayStep step = new ReplayStep(replayCase, gate.rulesFor(ctx), ctx);
        llm.beginUsageCapture();
        try {
            String answer = toolLoop(messages, tools.toolDefinitions(List.of()), List.of(), new ArrayList<>(),
                (msgs, defs) -> model == null || model.isBlank()
                    ? llm.rawChat(msgs, defs, "fast")
                    : llm.rawChatWithModel(msgs, defs, model),
                step, null, null);
            // R116 : la banque note la réponse que la personne verrait, corrigée par TaskForce.
            List<ActionClaimCheck.Ran> ran = step.calls.stream()
                .map(call -> new ActionClaimCheck.Ran(call.tool(), call.status())).toList();
            return new ReplayOutcome(ActionClaimCheck.check(answer, ran).answer(), step.calls, llm.currentModel(),
                llm.currentUsage());
        } finally {
            llm.endUsageCapture();
        }
    }

    /**
     * Une réponse sans outil, sur ce que TaskForce a lu pour le modèle (R131) : le banc des modèles et l'essai à l'aveugle. Rien
     * ne s'écrit et rien ne s'exécute. Le quota et le frein de débit sont à l'appelant, comme pour un rejeu.
     */
    public ReplayOutcome answerFrom(String material, String question, LocalDate today, String model) {
        String system = "You are Cortex, the AI copilot of a TaskForce workspace. Answer in the user's language, concisely. Use only "
            + "what you are given here: never add a person, a date, a number or a fact it does not state. Today is "
            + today.format(TODAY) + " (UTC).";
        if (material != null && !material.isBlank()) system += "\n\n" + material.strip();
        llm.beginUsageCapture();
        try {
            JsonNode reply = llm.rawChatWithModel(withHistory(system, List.of(), question), List.of(), model);
            return new ReplayOutcome(reply.path("content").asText(""), List.of(), llm.currentModel(), llm.currentUsage());
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
     * {@code ref} : l'empreinte d'un résultat réussi au dossier, que « Undo » nomme, ou de la carte de questions posée,
     * que la réponse nomme. {@code target} : l'issue d'un geste. {@code questions} : ce que TaskForce demande d'abord,
     * deux questions au plus dans la même carte (R115) ; null sans question.
     */
    private record ToolOutcome(String status, String result, String input, String ref, Map<String, Object> target,
                               List<Question> questions) {
        ToolOutcome(String status, String result) {
            this(status, result, null, null, null, null);
        }
    }

    /**
     * Ce que TaskForce donne à lire au modèle pendant une réponse, compté à mesure qu'il le lui donne (R123, la ligne
     * grise) : les tableaux (l'écran, ceux joints), les issues lues en entier, les outils qui lisent et ont abouti, les
     * notes servies. Rien n'est deviné après coup.
     */
    static final class Reading {
        private final List<AssistantRead.NoteRead> notes;
        private final List<AssistantRead.IssueRead> issues = new ArrayList<>();
        private final List<AssistantRead.BoardRead> boards = new ArrayList<>();
        private final Map<String, Integer> tools = new LinkedHashMap<>();
        private final List<AssistantRead.FileRead> files = new ArrayList<>();
        private int summarized;
        private int leftOut;
        private ToolLoopFit loop;

        Reading(List<KnowledgeNode> hits) {
            notes = hits.stream().map(note -> new AssistantRead.NoteRead(note.getId(), note.getTitle())).toList();
        }

        /** Ce qui a changé pour que l'historique tienne (TF-J1-13). */
        void fitted(TurnHistory.Fitted fitted) {
            summarized = fitted.summarized();
            leftOut = fitted.leftOut();
        }

        /** La boucle d'outils de ce tour : ce qu'elle raccourcit entre dans la ligne grise. */
        void watch(ToolLoopFit fit) {
            loop = fit;
        }

        void board(ScreenContext.Seen seen) {
            if (seen.project() != null) boards.add(new AssistantRead.BoardRead(seen.project(), seen.issues(), seen.open()));
        }

        void issues(List<AssistantRead.IssueRead> read) {
            issues.addAll(read);
        }

        void tool(String name) {
            tools.merge(name, 1, Integer::sum);
        }

        void file(String name) {
            files.add(new AssistantRead.FileRead(name));
        }

        AssistantRead read() {
            return read(List.of(), null, null);
        }

        /** Ce qui a été lu, avec ce que la réponse garde pour se relire : ses gestes, son dossier, le temps qu'elle a pris. */
        AssistantRead read(List<AssistantToolCall> calls, String record, long startedAt) {
            return read(calls, record, Long.valueOf(java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt)));
        }

        private AssistantRead read(List<AssistantToolCall> calls, String record, Long workedMs) {
            int out = leftOut + (loop == null ? 0 : loop.leftOut());
            int shortened = loop == null ? 0 : loop.shortened();
            ContextRead context = summarized == 0 && out == 0 && shortened == 0 ? null : new ContextRead(summarized, out, shortened);
            List<AssistantRead.ActRead> acts = calls.stream()
                .map(call -> new AssistantRead.ActRead(call.name(), call.status(), keyOf(call.target())))
                .toList();
            return new AssistantRead(issues, boards,
                tools.entrySet().stream().map(e -> new AssistantRead.ToolRead(e.getKey(), e.getValue())).toList(), notes.size(), context,
                files, notes, acts, workedMs, record);
        }

        private static String keyOf(Map<String, Object> target) {
            Object key = target == null ? null : target.get("key");
            return key == null ? null : key.toString();
        }
    }

    private static final String PROPOSED = "Action proposed to the user, waiting for their approval in the conversation. "
        + "Do not call this tool again; just summarize the action you propose.";

    /**
     * Les outils dont Cortex prépare l'action au lieu de la faire, même quand les règles l'autorisent : une issue se relit
     * et se modifie sur une carte, puis la personne la crée (R47, R78, séance n°13). L'accord passe par le dossier de la
     * réponse, comme pour une action demandée.
     */
    public static final Set<String> PREPARED = Set.of("create_issue");

    // Le modèle répète ce texte dans la langue de la personne : « the person » y devenait « le personnage » (recette 1.13,
    // 09/11/2026). Il s'adresse donc à elle, à la deuxième personne.
    private static final String PREPARED_TEXT = "Issue prepared as a card in the conversation, for the user to check, edit "
        + "and create. Do not call this tool again; tell the user directly, in their language and in one sentence, that "
        + "their card is ready to review, and do not say that the issue exists.";

    /**
     * Ce qui manque pour préparer la carte, que seule la personne peut dire (le projet, la personne nommée) : rien ne se
     * montre, Cortex pose une seule question courte (R102 : « pas chiant à remplir »). Statut du résultat : la carte
     * n'attend rien, la question suit dans la réponse.
     */
    public static final String QUESTION = "question";

    private static final String QUESTION_TEXT = " No card is shown yet. Ask the person one short question with the "
        + "choices, then prepare the card with the answer. Do not ask about anything else: the other fields stay editable "
        + "on the card.";

    /**
     * Ce que garde le dossier quand TaskForce pose la question d'un geste (R115) : la réponse s'arrête sur la question, et
     * le modèle ne la reprend pas à son compte.
     */
    private static final String QUESTION_ASKED = "Nothing was done: TaskForce asks the person first. ";

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

    /**
     * Une règle de l'entreprise désigne qui accorde, et la personne qui demande ne suffit pas seule (R98) : une carte de la
     * conversation ne se répond que par elle, donc rien ne se propose ; Cortex dit qui accorde, et pourquoi.
     */
    private String waitsForOthers(CortexGate.Verdict verdict, Long workspaceId) {
        RulesEngine.Obligations require = verdict.require();
        List<String> who = approvers.names(require, workspaceId);
        StringBuilder needs = new StringBuilder();
        if (!who.isEmpty()) needs.append(String.join(", and ", who));
        if (require != null && require.signatures() > 1) {
            needs.append(needs.length() == 0 ? "" : ", ").append(require.signatures()).append(" different people");
        }
        if (require != null && require.separate()) {
            needs.append(needs.length() == 0 ? "" : ", ").append("someone other than the person who asked");
        }
        return "Not run: the rules of this workspace need the approval of " + (needs.length() == 0 ? "someone else" : needs)
            + " (" + verdict.reason() + "). Only the person who asked can answer a card in this conversation, so "
            + "nothing was proposed. Do not try again; tell the user who has to approve it.";
    }

    /**
     * La décision au dossier : l'effet, les faits, et les règles qui l'ont prise (version, empreinte) ; le projet du
     * travail, et celui que l'outil nommait quand ses règles ont décidé.
     */
    private static Map<String, Object> decidedData(CortexGate.Verdict verdict, RulesBundle bundle, Long project,
                                                   Long decidedBy) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("effect", verdict.effect());
        data.put("facts", verdict.facts());
        if (bundle == null) return data;
        Map<String, Object> rules = new LinkedHashMap<>();
        rules.put("version", bundle.version());
        if (bundle.digest() != null) rules.put("digest", bundle.digest());
        if (project != null) rules.put("project", project);
        if (decidedBy != null && !decidedBy.equals(project)) rules.put("namedProject", decidedBy);
        data.put("rules", rules);
        return data;
    }

    /** Le projet dont les règles ont jugé la proposition de cet outil, tel que le dossier l'a gardé ; null s'il n'y en avait pas. */
    private Long proposedProject(UUID record, String toolName) {
        Long project = null;
        for (ObjectNode event : records.events(record)) {
            JsonNode data = event.path("data");
            if ("action.decided".equals(event.path("type").asText()) && toolName.equals(data.path("facts").path("tool").asText())) {
                JsonNode p = data.path("rules").path("project");
                project = p.canConvertToLong() ? p.asLong() : null;
            }
        }
        return project;
    }

    /**
     * La boucle : le modèle appelle des outils ou répond, cinq tours au plus. Un outil qui lit et aboutit entre dans ce que
     * le modèle a lu ({@code reading}, nul au rejeu d'un cas de la banque). Avant chaque appel, {@code fit} fait tenir les
     * messages dans la fenêtre du modèle (TF-J1-13 ; nul au rejeu, dont les cas sont courts).
     */
    private String toolLoop(List<Map<String, Object>> messages, List<Map<String, Object>> toolDefs,
                            List<AgentTool> external, List<AssistantToolCall> toolCalls, ModelCall model, ToolStep step,
                            Reading reading, ToolLoopFit fit) {
        for (int i = 0; i < MAX_TOOL_ITERS; i++) {
            if (fit != null && !fit.apply(messages)) {
                return "Answer interrupted: what the tools returned no longer fits this model's context.";
            }
            TurnProgress.say(i == 0 ? TurnProgress.THINKING : TurnProgress.WRITING);
            JsonNode msg = model.call(messages, toolDefs);
            JsonNode calls = msg.path("tool_calls");
            if (!calls.isArray() || calls.isEmpty()) {
                return msg.path("content").asText("");
            }
            messages.add(objectMapper.convertValue(msg, new TypeReference<Map<String, Object>>() {}));
            List<Question> asked = null;
            for (JsonNode call : calls) {
                String id = call.path("id").asText();
                String name = call.path("function").path("name").asText();
                String argsJson = call.path("function").path("arguments").asText("{}");
                AgentTool tool = tools.get(name, external);
                TurnProgress.tool(name);
                ToolOutcome outcome = tool == null
                    ? new ToolOutcome("error", "Unknown tool: " + name)
                    : step.apply(tool, name, argsJson);
                String shown = outcome.input() != null ? outcome.input() : argsJson;
                toolCalls.add(new AssistantToolCall(name, outcome.status(), shown, outcome.result(), step.recordRef(),
                    outcome.ref(), outcome.target(), card(outcome.questions())));
                if (reading != null && tool != null && "success".equals(outcome.status())
                        && CortexGate.READS.contains(CortexGate.facts(tool).get("action"))) {
                    reading.tool(name);
                }
                messages.add(Map.of("role", "tool", "tool_call_id", id, "content", outcome.result()));
                if (asked == null) asked = outcome.questions();
            }
            // R115 : TaskForce pose ses questions, et la réponse s'arrête là. Le modèle ne devine pas les réponses, et sa
            // phrase ne remplace pas les questions : ce sont elles que la personne lit, sur la carte de leurs choix.
            if (asked != null) return asking(asked);
        }
        return "Answer interrupted (too many tool steps).";
    }

    /** Les arguments qu'un geste a résolus, ou ceux de Cortex quand il n'en rend aucun. */
    private static Map<String, Object> resolvedOr(Map<String, Object> args, Map<String, Object> resolved) {
        return resolved == null || resolved.isEmpty() ? args : resolved;
    }

    /** Les questions d'une carte telles que la réponse les dit : une par ligne, dans l'ordre de la carte. */
    static String asking(List<Question> questions) {
        return questions.stream().map(Question::text).collect(Collectors.joining("\n"));
    }

    /** Les questions telles que la carte les montre ; null sans question. */
    static List<AssistantQuestion> card(List<Question> questions) {
        if (questions == null || questions.isEmpty()) return null;
        return questions.stream()
            .map(question -> new AssistantQuestion(question.field(), question.header(), question.text(), question.multiple(),
                question.choices().stream()
                    .map(choice -> new AssistantChoice(choice.value(), choice.label(), choice.description(), choice.recommended()))
                    .toList()))
            .toList();
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
        private final AgentContext ctx;
        private final List<ReplayOutcome.ReplayCall> calls = new ArrayList<>();

        ReplayStep(ReplayCase replayCase, RulesBundle bundle, AgentContext ctx) {
            this.replayCase = replayCase;
            this.bundle = bundle;
            this.ctx = ctx;
        }

        @Override
        public ToolOutcome apply(AgentTool tool, String name, String argsJson) {
            CortexGate.Verdict verdict = gate.judge(bundle, tool, argsJson, CortexGate.Exposure.none(), ctx);
            ToolOutcome outcome;
            if (verdict.denied()) {
                outcome = new ToolOutcome("refused", refusedText(verdict));
            } else if (verdict.allowed() && CortexGate.READS.contains(verdict.facts().get("action"))) {
                String served = replayCase.served(name, argsJson);
                outcome = served == null
                    ? new ToolOutcome("error", "Not available in this test case: this read was not made when it was "
                        + "written. Answer from what you have.")
                    : new ToolOutcome("success", served);
            } else if (replayCase.simulates(name)) {
                // Le banc (R131) : l'écriture est dite réussie pour que la demande continue ; rien n'est exécuté.
                outcome = new ToolOutcome("success", replayCase.served(name, argsJson));
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
        /** Les règles du travail en cours, par projet touché (R157) : lues une fois par réponse et par projet. */
        private final Map<Long, RulesBundle> bundles = new HashMap<>();
        /** Ce que la réponse a déjà lu (R158) : le socle en tient compte avant toute écriture ou sortie. */
        private final CortexGate.Exposure exposure;
        private Map<String, String> judgedFacts;
        /** La dernière décision des règles du travail, avec ce qu'un accord doit réunir dans chaque projet. */
        private CortexGate.Judged lastJudged;
        private UUID record;

        Kernel(AgentContext ctx, String question, Map<String, Object> origin) {
            this.ctx = ctx;
            this.question = question;
            this.origin = origin;
            this.exposure = CortexGate.Exposure.of(origin);
        }

        /** Le noyau d'un geste qui reprend après la réponse de la personne : le dossier est celui de sa question. */
        Kernel(AgentContext ctx, UUID record) {
            this(ctx, null, Map.of());
            this.record = record;
        }

        /**
         * TaskForce pose lui-même la question d'un geste, sans le modèle (R135) : la demande et la décision des règles entrent
         * au dossier, puis la carte, dont la réponse reprendra ces arguments.
         */
        ToolOutcome asks(AgentTool tool, String name, String argsJson, List<Question> questions) {
            CortexGate.Verdict verdict = judge(tool, argsJson);
            if (verdict.denied()) {
                String refused = refusedText(verdict);
                return new ToolOutcome("refused", refused, null, result(name, "refused", refused, null), null, null);
            }
            String said = QUESTION_ASKED + questions.stream().map(Question::asText).collect(Collectors.joining(" "));
            return new ToolOutcome(QUESTION, said, null, asked(name, argsJson, said, questions), null, questions);
        }

        /** Tracer avant d'agir : la demande et la décision entrent au dossier avant tout effet. */
        @Override
        public ToolOutcome apply(AgentTool tool, String name, String argsJson) {
            String result;
            String status = "success";
            String shown = null;
            CortexGesture.Done done = null;
            List<Question> asked = null;
            try {
                CortexGate.Verdict verdict = judge(tool, argsJson);
                if (verdict.denied()) {
                    result = refusedText(verdict);
                    status = "refused";
                } else if (!verdict.allowed()) {
                    // Demandé : jamais exécuté par le modèle. Une règle de l'entreprise qui désigne qui accorde (R98) : la
                    // carte de la conversation ne se répond que par la personne qui demande ; si elle ne suffit pas seule,
                    // rien ne se propose, et Cortex dit qui accorde. Une écriture externe ne se propose qu'à qui peut la
                    // valider : la personne pour sa connexion ; un propriétaire ou un administrateur pour une connexion
                    // partagée (séance n°22, R154 ; OSS-1.5) ; les autres l'apprennent d'emblée.
                    if (!lastJudged.aloneSuffices(approvers, ctx.workspaceId(), ctx.userId())) {
                        result = waitsForOthers(verdict, ctx.workspaceId());
                        status = "refused";
                    } else if (tool instanceof ExternalMcpTool external && external.shared()
                            && !authorization.isManager(ctx.workspaceId(), ctx.userId())) {
                        result = "Not run: only workspace owners and admins can approve a change through a connection "
                            + "shared with the workspace. Tell the user that an owner or admin has to make this "
                            + "change, or that she can connect the tool with her own account.";
                        status = "error";
                    } else {
                        // La carte dit ce que la personne accorde : l'issue qu'on supprimerait, ce qui partirait avec elle.
                        // Ce qu'il manque au geste se demande avant elle (R115), et l'accord reprend l'issue de la carte.
                        String resolved = ask(tool, argsJson);
                        done = preview(tool, resolved);
                        result = done == null ? PROPOSED : done.text() + " " + PROPOSED;
                        status = "pending";
                        if (!resolved.equals(argsJson)) shown = resolved;
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
                    String resolved = ask(tool, argsJson);
                    result = ASKED_TEXT;
                    status = "pending";
                    if (!resolved.equals(argsJson)) shown = resolved;
                } else {
                    Map<String, Object> args = objectMapper.readValue(argsJson, new TypeReference<Map<String, Object>>() {});
                    // Ce que Cortex écrit garde le modèle qui le fait parler (R123) : son commentaire dit « Cortex ·
                    // qwen3:8b ». Une reprise après les réponses de la personne relit celui du dossier.
                    if (tool instanceof CortexGesture gesture) {
                        Map<String, Object> resolved = resolvedOr(args, gesture.ask(args, ctx));
                        done = DelegatedAgent.withModel(model(), () -> gesture.perform(resolved, ctx));
                        result = done.text();
                    } else {
                        result = DelegatedAgent.withModel(model(), () -> tool.execute(args, ctx));
                    }
                }
            } catch (QuestionNeeded needed) {
                // R115 : le geste attend des réponses que seule la personne peut donner. Rien n'est écrit ; TaskForce
                // pose ses questions, deux au plus dans la même carte, et le geste reprend sur son envoi.
                asked = needed.questions();
                result = QUESTION_ASKED + needed.getMessage();
                status = QUESTION;
                done = null;
            } catch (Exception e) {
                result = "Tool " + name + " failed: " + e.getMessage();
                status = "error";
                done = null;
            }
            // Ce que l'outil a lu entre dans la réponse (R158) : les gestes suivants le portent dans leurs faits.
            exposure.after(tool, judgedFacts, status);
            if ("success".equals(status) && gate.readImported(ctx, judgedFacts, argsJson)) exposure.outside();
            if (asked != null) {
                return new ToolOutcome(status, result, null, asked(name, argsJson, result, asked), null, asked);
            }
            String ref = result(name, status, result, done == null ? null : done.undo());
            return new ToolOutcome(status, result, shown, undoable(tool, status, done) ? ref : null,
                done == null ? null : done.target(), null);
        }

        /**
         * Ce qu'il manque au geste (R115), demandé avant qu'il agisse : une question levée, ou ses arguments tels qu'il les
         * entend. Les mêmes que ceux de Cortex quand rien n'a changé.
         */
        private String ask(AgentTool tool, String argsJson) throws JsonProcessingException {
            if (!(tool instanceof CortexGesture gesture)) return argsJson;
            Map<String, Object> args = objectMapper.readValue(argsJson, new TypeReference<Map<String, Object>>() {});
            Map<String, Object> resolved = resolvedOr(args, gesture.ask(args, ctx));
            return resolved.equals(args) ? argsJson : objectMapper.writeValueAsString(resolved);
        }

        /**
         * La carte de questions au dossier, avec ce que le geste reprendra : ses arguments tels que Cortex les a passés
         * (en entier, le geste en a besoin), et l'écran, dont viendront les choix d'une question suivante. Son empreinte
         * est ce que la réponse nomme ; sans dossier, la carte ne se répond pas.
         */
        private String asked(String tool, String argsJson, String output, List<Question> asked) {
            if (record == null) return null;
            try {
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("tool", tool);
                data.put("status", QUESTION);
                data.put("output", CortexRecordService.shorten(output));
                data.put("arguments", argsJson == null || argsJson.isBlank() ? "{}" : argsJson);
                data.put("questions", objectMapper.convertValue(asked, new TypeReference<List<Map<String, Object>>>() {}));
                Map<String, Object> screen = new LinkedHashMap<>();
                screen.put("projectId", ctx.screen().projectId());
                screen.put("issueId", ctx.screen().issueId());
                data.put("screen", screen);
                if (ctx.conversation() != null) data.put("conversation", ctx.conversation());
                return records.append(record, "action.result", CortexRecordService.Actor.SERVER, data).orElse(null);
            } catch (RuntimeException e) {
                log.warn("Cortex : question de {} non gardée au dossier : {}", LogSafe.of(tool), LogSafe.of(e.getMessage()));
                return null;
            }
        }

        /** Ce que montre la carte d'un geste demandé ; null pour un autre outil, ou un geste sans rien de plus à montrer. */
        private CortexGesture.Done preview(AgentTool tool, String argsJson) throws JsonProcessingException {
            if (!(tool instanceof CortexGesture gesture)) return null;
            return gesture.preview(objectMapper.readValue(argsJson, new TypeReference<Map<String, Object>>() {}), ctx);
        }

        /**
         * La demande, puis la décision des règles, au dossier avant tout effet : sans dossier, l'action ne part pas. Les
         * règles sont celles du projet que l'appel touche (R157), sinon de la conversation ou de l'écran ; le dossier
         * garde leur version, leur empreinte et ce projet, que l'accord de la personne relira.
         */
        CortexGate.Verdict judge(AgentTool tool, String argsJson) {
            // Les règles du travail en cours : la conversation, sinon l'écran ; jamais un projet que nomment les arguments.
            Long project = CortexGate.workProject(ctx);
            if (record == null) record = records.open(ctx, question, withModel(origin));
            traceBefore(record, "action.requested", CortexRecordService.Actor.CORTEX,
                Map.of("tool", tool.name(), "arguments", CortexRecordService.shorten(argsJson)));
            CortexGate.Judged judged = gate.judgeWork(ctx, project, tool, argsJson, exposure,
                p -> bundles.computeIfAbsent(p, q -> gate.rulesFor(ctx, q)));
            CortexGate.Verdict verdict = judged.verdict();
            traceBefore(record, "action.decided", CortexRecordService.Actor.rule(verdict.ruleId()),
                decidedData(verdict, judged.bundle(), project, judged.project()));
            judgedFacts = verdict.facts();
            lastJudged = judged;
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

        /**
         * Le modèle qui fait parler Cortex pour ce geste : celui qui répond, sinon celui que le dossier a gardé à son
         * ouverture (une reprise sur les réponses de la personne, sans appel au modèle) ; null quand ni l'un ni l'autre
         * ne le dit.
         */
        private String model() {
            String current = llm.currentModel();
            if (current != null && !current.isBlank()) return current;
            return record == null ? null : records.model(record).orElse(null);
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

    /**
     * Le prompt : les consignes, puis le plan de la demande (R117), l'écran (R114), et les notes du Brain OS en dernier.
     * {@code plan} est null et {@code screen} vide quand rien ne s'y applique.
     */
    private String systemPrompt(CortexPlans.Plan plan, String screen, List<KnowledgeNode> hits, List<AgentTool> external,
                                LocalDate today) {
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
          .append("one. Give the project only when the request names one: otherwise leave it out and never take it from ")
          .append("the screen, TaskForce uses the project of this conversation or asks the person. Ask one short question, ")
          .append("with the choices, before preparing the card only when the request names a person who matches several ")
          .append("members. Never ask about the other fields: they stay editable on the card. ")
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
          .append("is answered or a result applied: only the buttons of the cards do that, even when the person writes yes. ")
          // R115 : ce qu'un geste exige et que la demande ne dit pas, TaskForce le demande, pas le modèle.
          .append("When a change needs something the request does not say (which issue, a project's name), call its tool ")
          .append("with what you know and nothing invented: TaskForce asks the person, with choices. Never write that ")
          .append("question yourself. ");
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
        if (plan != null) sb.append("\n\n").append(plan.text());
        if (screen != null && !screen.isBlank()) sb.append("\n\n").append(screen.strip());
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

    /** Une sortie d'outil que TaskForce redit telle quelle : une phrase courte, pas une liste lue. */
    private static final int MAX_SAID = 280;

    /**
     * Ce que dit la réponse quand Cortex n'a rien dit (décision du CEO, 02/11/2026 : qwen3:8b répond souvent par un texte
     * vide à une demande de suppression) : ce que dit la carte qui attend, ou ce qu'un outil a fait ou refusé, une phrase
     * par chose, dans la voix de la conversation (R136). Sans aucun geste, c'est le modèle qui n'a rien rendu : TaskForce
     * le dit, comme tout ce qu'il dit du modèle. Une réponse écrite reste celle de Cortex.
     */
    static String silentAnswer(String answer, List<AssistantToolCall> toolCalls, String model) {
        if (answer != null && !answer.isBlank()) return answer;
        if (toolCalls.isEmpty()) {
            return signed(ABOUT_MODELS, List.of((model == null || model.isBlank() ? "The model" : model)
                + " returned an empty answer, so nothing was done. Ask again, or choose another model."));
        }
        Set<String> said = new LinkedHashSet<>();
        List<String> questions = new ArrayList<>();
        for (AssistantToolCall call : toolCalls) {
            String output = call.output() == null ? "" : call.output().strip();
            switch (call.status()) {
                case "pending" -> said.add(CARD_ANSWERS.getOrDefault(call.name(), PREPARED.contains(call.name())
                    ? "Nothing is created yet: check the issue below, then create it."
                    : "Nothing has changed yet: the action below waits for your approval."));
                case "success" -> said.add(output.isEmpty() || output.length() > MAX_SAID || output.contains("\n")
                    ? "What it read or did shows below." : output);
                case "refused" -> said.add("Nothing was done: the rules of this workspace refuse it.");
                case "error" -> said.add("An action failed, so nothing was done: "
                    + clipped(output.replaceFirst("^Tool \\S+ failed: ", ""), MAX_SAID));
                case QUESTION -> {
                    if (call.questions() == null || call.questions().isEmpty()) said.add("One question first, below.");
                    else call.questions().forEach(question -> questions.add(question.text()));
                }
                default -> { /* un résultat défait ou inconnu : rien de plus à dire */ }
            }
        }
        String plain = String.join("\n\n", said);
        return questions.isEmpty() ? plain : (plain.isEmpty() ? "" : plain + "\n\n") + signed(ASKS, questions);
    }

    /**
     * La marque des questions d'un geste (R115) : l'app montre la carte à leur place, et une conversation rouverte, sans sa
     * carte, les relit comme les mots de Cortex (R136). Une marque pour l'app, jamais une signature à l'écran.
     */
    static final String ASKS = ActionClaimCheck.SIGNATURE + " · asks";

    /**
     * La réponse d'un tour qui s'arrête sur les questions d'un geste (R115) : une par ligne, sous leur marque ; la carte
     * porte leurs choix.
     */
    static String askedAnswer(String answer, List<AssistantToolCall> toolCalls) {
        if (answer == null) return null;
        return toolCalls.stream()
            .filter(call -> QUESTION.equals(call.status()) && call.questions() != null && !call.questions().isEmpty())
            .map(call -> call.questions().stream().map(AssistantQuestion::text).toList())
            .filter(texts -> answer.strip().equals(String.join("\n", texts)))
            .map(texts -> signed(ASKS, texts))
            .findFirst()
            .orElse(answer);
    }

    /** Un bloc marqué, tel que l'app le relit : la marque, puis une ligne par phrase. */
    private static String signed(String signature, List<String> lines) {
        StringBuilder block = new StringBuilder(signature);
        lines.forEach(line -> block.append("\n> ").append(line));
        return block.append('\n').toString();
    }

    private static String clipped(String text, int max) {
        String flat = text.replaceAll("\\s+", " ").strip();
        return flat.length() <= max ? flat : flat.substring(0, max).stripTrailing() + "...";
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
            sb.append("- [[").append(n.getTitle()).append("]]\n");
        }
        return sb.toString().stripTrailing();
    }
}
