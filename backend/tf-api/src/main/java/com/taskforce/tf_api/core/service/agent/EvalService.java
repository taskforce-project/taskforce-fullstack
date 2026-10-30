package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.response.EvalBankResponse;
import com.taskforce.tf_api.core.dto.response.EvalBankResponse.CaseSummary;
import com.taskforce.tf_api.core.dto.response.EvalBankResponse.Draft;
import com.taskforce.tf_api.core.dto.response.EvalBankResponse.DraftCall;
import com.taskforce.tf_api.core.dto.response.EvalBankResponse.Result;
import com.taskforce.tf_api.core.dto.response.EvalBankResponse.RunDetail;
import com.taskforce.tf_api.core.dto.response.EvalBankResponse.RunSummary;
import com.taskforce.tf_api.core.model.EvalBankSetting;
import com.taskforce.tf_api.core.model.EvalCase;
import com.taskforce.tf_api.core.model.EvalResult;
import com.taskforce.tf_api.core.model.EvalRun;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.EvalBankSettingRepository;
import com.taskforce.tf_api.core.repository.EvalCaseRepository;
import com.taskforce.tf_api.core.repository.EvalResultRepository;
import com.taskforce.tf_api.core.repository.EvalRunRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.agent.ReplayCase.CassetteEntry;
import com.taskforce.tf_api.core.service.agent.ReplayCase.FrozenNote;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * La banque d'évaluations de Cortex (R61, séance n°10).
 *
 * <ul>
 *   <li>Un cas naît d'un geste de la personne sur une de ses réponses : le serveur fige, depuis le dossier de cette
 *       réponse, la question, sa date, les notes servies et ce que les outils de lecture ont rendu.</li>
 *   <li>Les critères viennent de l'acte qu'elle a validé, et sont datés avant tout rejeu.</li>
 *   <li>Un rejeu fait répondre un modèle nommé à chaque cas, sans toucher l'espace, et le note par du code.</li>
 *   <li>Coupée, la banque ne prend plus de cas ; les siens restent, rejouables.</li>
 * </ul>
 *
 * <p>Aucune transaction n'englobe un appel au modèle (PC-022) : un rejeu enregistre sa note après coup.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EvalService {

    /** Une banque reste lisible : au-delà, on archive avant d'ajouter. */
    static final int MAX_CASES = 200;
    static final int MAX_ITEMS = 10;
    static final int MAX_VALUE = 200;
    static final int MAX_TITLE = 200;
    /** Le modèle par défaut de l'instance (le tier rapide), quand le rejeu n'en nomme pas. */
    static final String DEFAULT_MODEL = "default";
    private static final int MAX_ANSWER = 1000;
    private static final int MAX_NOTE = 2000;
    private static final int MAX_ARG_PROPOSED = 80;
    private static final Set<String> LONG_TEXT_ARGS = Set.of("description", "content");
    private static final Set<String> EFFECTS = Set.of("allow", "ask", "deny");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final BrainAccessGuard access;
    private final AuthorizationService authorization;
    private final CortexRecordService records;
    private final KnowledgeNodeRepository nodes;
    private final AgentToolRegistry tools;
    private final AgentService agent;
    private final AiUsageService aiUsage;
    private final EvalCaseRepository cases;
    private final EvalRunRepository runs;
    private final EvalResultRepository results;
    private final EvalBankSettingRepository settings;

    /** La banque d'un espace : son interrupteur, ses cas actifs, ses dix derniers rejeux. */
    @Transactional(readOnly = true)
    public EvalBankResponse bank(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        List<CaseSummary> active = cases.findByWorkspaceIdAndArchivedFalseOrderByCreatedAtDesc(ws.getId()).stream()
            .map(evalCase -> summary(evalCase, userId))
            .toList();
        List<RunSummary> recent = runs.findTop10ByWorkspaceIdOrderByStartedAtDesc(ws.getId()).stream()
            .map(EvalService::summary)
            .toList();
        return new EvalBankResponse(enabled(ws.getId()), authorization.isManager(ws.getId(), userId), active, recent);
    }

    /** Le brouillon d'un cas, tiré du dossier d'une réponse de la personne ; elle le confirme ou le corrige. */
    public Draft draft(String slug, Long userId, String recordRef) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        requireEnabled(ws.getId());
        Frozen frozen = freeze(new AgentContext(slug, ws.getId(), userId), recordId(recordRef));
        List<DraftCall> calls = frozen.calls().stream()
            .map(call -> new DraftCall(call.tool, call.arguments, call.effect, call.status, call.read()))
            .toList();
        return new Draft(recordRef, title(null, frozen.question(), 80), frozen.question(), frozen.askedOn(),
            frozen.notes().stream().map(FrozenNote::title).toList(), calls, propose(frozen.calls()));
    }

    /**
     * Ajoute un cas : le contenu figé est refait par le serveur depuis le dossier, jamais repris du client ; ses critères
     * sont datés maintenant, avant tout rejeu.
     */
    @Transactional
    public CaseSummary create(String slug, Long userId, String recordRef, String title, EvalCriteria criteria) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        requireEnabled(ws.getId());
        if (cases.countByWorkspaceIdAndArchivedFalse(ws.getId()) >= MAX_CASES) {
            throw new BusinessException("The test bank holds " + MAX_CASES + " cases: archive one before adding another.");
        }
        validate(criteria);
        UUID record = recordId(recordRef);
        Frozen frozen = freeze(new AgentContext(slug, ws.getId(), userId), record);
        LocalDateTime now = LocalDateTime.now();
        EvalCase saved = cases.save(EvalCase.builder()
            .workspaceId(ws.getId()).createdBy(userId).createdAt(now).criteriaAt(now).sourceRecord(record)
            .title(title(title, frozen.question(), MAX_TITLE)).question(frozen.question()).askedOn(frozen.askedOn())
            .notes(json(frozen.notes())).cassette(json(frozen.cassette())).criteria(json(criteria)).archived(false)
            .build());
        return summary(saved, userId);
    }

    /** Archive un cas : la personne qui l'a ajouté, ou un gestionnaire de l'espace. Ses notes passées restent. */
    @Transactional
    public void archive(String slug, Long userId, Long caseId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        EvalCase evalCase = cases.findByIdAndWorkspaceId(caseId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("This case was not found."));
        if (!userId.equals(evalCase.getCreatedBy()) && !authorization.isManager(ws.getId(), userId)) {
            throw new ForbiddenException("Only the person who added this case, or an owner or admin, can archive it.");
        }
        evalCase.setArchived(true);
        cases.save(evalCase);
    }

    /** Ouvre un rejeu avec un modèle nommé : ses cas sont ceux dont les critères précèdent son départ. */
    @Transactional
    public RunSummary startRun(String slug, Long userId, String model) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        String name = model == null || model.isBlank() ? DEFAULT_MODEL : model.strip();
        if (name.length() > 128) throw new BusinessException("The model name is too long.");
        LocalDateTime now = LocalDateTime.now();
        long total = cases.countByWorkspaceIdAndArchivedFalseAndCriteriaAtLessThanEqual(ws.getId(), now);
        if (total == 0) throw new BusinessException("The test bank has no case yet: add one from an answer of Cortex.");
        EvalRun run = runs.save(EvalRun.builder()
            .workspaceId(ws.getId()).startedBy(userId).startedAt(now).model(name).total((int) total).passed(0).build());
        return summary(run);
    }

    /**
     * Rejoue un cas dans un rejeu, une seule fois. Le quota et le frein de débit de l'IA valent comme pour une réponse ;
     * une panne du modèle remonte telle quelle, sans note, pour qu'on rejoue le cas.
     */
    public Result runCase(String slug, Long userId, Long runId, Long caseId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        EvalRun run = runs.findByIdAndWorkspaceId(runId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("This run was not found."));
        EvalCase evalCase = cases.findByIdAndWorkspaceId(caseId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("This case was not found."));
        Optional<EvalResult> done = results.findByRunIdAndCaseId(runId, caseId);
        if (done.isPresent()) return result(done.get(), evalCase);
        if (evalCase.isArchived()) throw new BusinessException("This case is archived.");
        if (evalCase.getCriteriaAt().isAfter(run.getStartedAt())) {
            throw new BusinessException("This case was written after the run started: its criteria must come first.");
        }
        aiUsage.assertWithinQuota(ws.getId());
        String model = DEFAULT_MODEL.equals(run.getModel()) ? null : run.getModel();
        ReplayOutcome outcome = agent.replay(new AgentContext(slug, ws.getId(), userId), replayCase(evalCase), model);
        recordUsage(ws.getId(), outcome.usage());
        EvalGrader.Grade grade = EvalGrader.grade(read(evalCase.getCriteria(), EvalCriteria.class), outcome);
        Details details = new Details(grade.checks(), outcome.calls(), shorten(outcome.answer(), MAX_ANSWER), outcome.model());
        EvalResult saved;
        try {
            saved = results.save(EvalResult.builder().runId(runId).caseId(caseId).passed(grade.passed())
                .details(json(details)).createdAt(LocalDateTime.now()).build());
        } catch (DataIntegrityViolationException twice) { // deux rejeux du même cas en même temps : le premier compte
            return results.findByRunIdAndCaseId(runId, caseId).map(r -> result(r, evalCase)).orElseThrow(() -> twice);
        }
        settle(run);
        return result(saved, evalCase);
    }

    /** Un rejeu et les notes de ses cas. */
    @Transactional(readOnly = true)
    public RunDetail run(String slug, Long userId, Long runId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        EvalRun run = runs.findByIdAndWorkspaceId(runId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("This run was not found."));
        List<Result> graded = results.findByRunIdOrderByIdAsc(runId).stream()
            .map(r -> result(r, cases.findByIdAndWorkspaceId(r.getCaseId(), ws.getId()).orElse(null)))
            .toList();
        return new RunDetail(summary(run), graded);
    }

    /** L'interrupteur, pour un propriétaire ou un administrateur : coupée, la banque ne prend plus de cas. */
    @Transactional
    public boolean setEnabled(String slug, Long userId, boolean enabled) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        authorization.requireManager(ws.getId(), userId);
        settings.save(EvalBankSetting.builder().workspaceId(ws.getId()).enabled(enabled).updatedBy(userId)
            .updatedAt(LocalDateTime.now()).build());
        return enabled;
    }

    // -------------------------------------------------------------------------
    // Le contenu figé d'un cas, tiré du dossier d'une réponse
    // -------------------------------------------------------------------------

    /** Un appel d'outil de la réponse, rassemblé depuis sa demande, sa décision et son résultat au dossier. */
    static final class Call {
        final String tool;
        final String arguments;
        String effect = "";
        String action = "";
        String status = "";
        String output = "";

        Call(String tool, String arguments) {
            this.tool = tool;
            this.arguments = arguments;
        }

        boolean read() {
            return CortexGate.READS.contains(action);
        }

        boolean internal() {
            return !tool.contains("__");
        }
    }

    record Frozen(String question, LocalDate askedOn, List<FrozenNote> notes, List<CassetteEntry> cassette,
                  List<Call> calls) {
    }

    private Frozen freeze(AgentContext ctx, UUID record) {
        if (!records.owns(record, ctx)) throw new ResourceNotFoundException("This answer's record was not found.");
        String question = null;
        LocalDate askedOn = null;
        List<FrozenNote> notes = new ArrayList<>();
        List<Call> calls = new ArrayList<>();
        Call open = null;
        for (ObjectNode event : records.events(record)) {
            JsonNode data = event.path("data");
            switch (event.path("type").asText()) {
                case "mission.started" -> {
                    question = data.path("question").asText("");
                    askedOn = LocalDate.parse(event.path("at").asText().substring(0, 10));
                    for (JsonNode served : data.path("notes")) {
                        if (!served.path("id").canConvertToLong()) continue;
                        nodes.findByIdAndWorkspaceId(served.path("id").asLong(), ctx.workspaceId())
                            .ifPresent(n -> notes.add(new FrozenNote(n.getTitle(), n.getDomain().name(),
                                shorten(n.getContent(), MAX_NOTE))));
                    }
                }
                case "action.requested" -> open = new Call(data.path("tool").asText(), data.path("arguments").asText("{}"));
                case "action.decided" -> {
                    if (open != null) {
                        open.effect = data.path("effect").asText("");
                        open.action = data.path("facts").path("action").asText("");
                    }
                }
                case "action.result" -> {
                    if (open != null && open.tool.equals(data.path("tool").asText())) {
                        open.status = data.path("status").asText("");
                        open.output = data.path("output").asText("");
                        calls.add(open);
                        open = null;
                    }
                }
                case "human.decision" -> {
                    if ("approved".equals(data.path("decision").asText())) approve(calls, data.path("tool").asText());
                }
                default -> { /* les autres événements ne figent rien */ }
            }
        }
        if (question == null || question.isBlank() || askedOn == null) {
            throw new BusinessException("This answer's record has no question to replay.");
        }
        List<CassetteEntry> cassette = calls.stream()
            .filter(call -> call.read() && "success".equals(call.status))
            .map(call -> new CassetteEntry(call.tool, ReplayCase.canonical(call.arguments), call.output))
            .toList();
        return new Frozen(question, askedOn, List.copyOf(notes), cassette, List.copyOf(calls));
    }

    /** La personne a accordé la dernière proposition de cet outil : c'est l'acte qu'elle a validé. */
    private static void approve(List<Call> calls, String tool) {
        for (int i = calls.size() - 1; i >= 0; i--) {
            Call call = calls.get(i);
            if (call.tool.equals(tool) && "pending".equals(call.status)) {
                call.status = "approved";
                return;
            }
        }
    }

    /** Les critères proposés : l'écriture faite ou accordée, sinon la lecture faite, sinon aucun outil. */
    static EvalCriteria propose(List<Call> calls) {
        List<Call> internal = calls.stream().filter(Call::internal).toList();
        Call act = internal.stream().filter(call -> !call.read()).findFirst()
            .orElse(internal.stream().findFirst().orElse(null));
        if (act == null) return new EvalCriteria(EvalCriteria.NO_TOOL, null, null, null, null, null);
        return new EvalCriteria(act.tool, shortArgs(act.arguments), act.read() ? null : act.effect, null, null, null);
    }

    /** Les arguments courts d'un appel, chacun avec sa valeur pour seule valeur acceptée ; un texte long n'en est pas un critère. */
    private static Map<String, List<String>> shortArgs(String argsJson) {
        Map<String, List<String>> args = new LinkedHashMap<>();
        try {
            JsonNode node = JSON.readTree(argsJson == null || argsJson.isBlank() ? "{}" : argsJson);
            node.properties().forEach(field -> {
                JsonNode value = field.getValue();
                if (!value.isValueNode() || value.isNull() || LONG_TEXT_ARGS.contains(field.getKey())) return;
                String text = value.asText().strip();
                if (!text.isEmpty() && text.length() <= MAX_ARG_PROPOSED) args.put(field.getKey(), List.of(text));
            });
        } catch (JsonProcessingException unreadable) {
            return Map.of();
        }
        return args;
    }

    // -------------------------------------------------------------------------
    // Les règles d'un cas
    // -------------------------------------------------------------------------

    private void validate(EvalCriteria criteria) {
        if (criteria == null) throw new BusinessException("A case needs its criteria.");
        Set<String> known = tools.all().stream().map(AgentTool::name).collect(Collectors.toSet());
        if (!criteria.tool().isEmpty() && !EvalCriteria.NO_TOOL.equals(criteria.tool()) && !known.contains(criteria.tool())) {
            throw new BusinessException("Unknown tool in this case: " + criteria.tool() + ".");
        }
        if (!criteria.effect().isEmpty() && !EFFECTS.contains(criteria.effect())) {
            throw new BusinessException("A rule effect is allow, ask or deny.");
        }
        if (criteria.args().size() > MAX_ITEMS) throw new BusinessException("A case checks " + MAX_ITEMS + " arguments at most.");
        criteria.args().forEach((key, values) -> {
            if (key.isBlank() || key.length() > 64) throw new BusinessException("An argument needs a short name.");
            items(values, "values of " + key);
        });
        for (String forbidden : criteria.forbid()) {
            if (!known.contains(forbidden)) throw new BusinessException("Unknown tool in this case: " + forbidden + ".");
        }
        items(criteria.forbid(), "forbidden tools");
        items(criteria.contains(), "expected words");
        items(criteria.notContains(), "forbidden words");
        boolean empty = criteria.tool().isEmpty() && criteria.forbid().isEmpty() && criteria.contains().isEmpty()
            && criteria.notContains().isEmpty();
        if (empty) throw new BusinessException("A case needs at least one criterion.");
    }

    private static void items(List<String> values, String what) {
        if (values.size() > MAX_ITEMS) throw new BusinessException("A case holds " + MAX_ITEMS + " " + what + " at most.");
        for (String value : values) {
            if (value == null || value.isBlank() || value.length() > MAX_VALUE) {
                throw new BusinessException("Each of the " + what + " is between 1 and " + MAX_VALUE + " characters.");
            }
        }
    }

    // -------------------------------------------------------------------------
    // Le reste
    // -------------------------------------------------------------------------

    /** Le détail gardé avec une note. */
    record Details(List<EvalGrader.Check> checks, List<ReplayOutcome.ReplayCall> calls, String answer, String model) {
    }

    private boolean enabled(Long workspaceId) {
        return settings.findById(workspaceId).map(EvalBankSetting::isEnabled).orElse(true);
    }

    private void requireEnabled(Long workspaceId) {
        if (!enabled(workspaceId)) {
            throw new BusinessException("The test bank of this workspace is turned off: an owner or admin turns it on.");
        }
    }

    private void settle(EvalRun run) {
        run.setPassed((int) results.countByRunIdAndPassedTrue(run.getId()));
        if (results.countByRunId(run.getId()) >= run.getTotal()) run.setFinishedAt(LocalDateTime.now());
        runs.save(run);
    }

    private void recordUsage(Long workspaceId, LlmUsage usage) {
        try {
            aiUsage.record(workspaceId, usage);
        } catch (RuntimeException e) {
            log.warn("Banque d'évaluations : conso IA non comptée (ws={}) : {}", workspaceId, LogSafe.of(e.getMessage()));
        }
    }

    private static ReplayCase replayCase(EvalCase evalCase) {
        return new ReplayCase(evalCase.getQuestion(), evalCase.getAskedOn(),
            read(evalCase.getNotes(), new TypeReference<List<FrozenNote>>() {}),
            read(evalCase.getCassette(), new TypeReference<List<CassetteEntry>>() {}));
    }

    private static Result result(EvalResult result, EvalCase evalCase) {
        Details details = read(result.getDetails(), Details.class);
        return new Result(result.getCaseId(), evalCase == null ? "" : evalCase.getTitle(), result.isPassed(),
            details.checks(), details.calls(), details.answer(), details.model());
    }

    private static CaseSummary summary(EvalCase evalCase, Long userId) {
        EvalCriteria criteria = read(evalCase.getCriteria(), EvalCriteria.class);
        return new CaseSummary(evalCase.getId(), evalCase.getTitle(), evalCase.getQuestion(), criteria.tool(),
            evalCase.getCreatedAt(), evalCase.getCriteriaAt(), userId.equals(evalCase.getCreatedBy()));
    }

    private static RunSummary summary(EvalRun run) {
        return new RunSummary(run.getId(), run.getModel(), run.getStartedAt(), run.getFinishedAt(), run.getTotal(),
            run.getPassed());
    }

    /** Le titre d'un cas : celui que la personne donne, sinon sa question, coupé à {@code max} caractères. */
    private static String title(String asked, String question, int max) {
        String chosen = asked == null || asked.isBlank() ? question : asked;
        String flat = chosen.replace('\n', ' ').strip();
        return flat.length() <= max ? flat : flat.substring(0, max).strip();
    }

    private static UUID recordId(String ref) {
        try {
            return UUID.fromString(ref);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BusinessException("This answer's record is not valid.");
        }
    }

    static String shorten(String text, int max) {
        if (text == null) return "";
        return text.length() <= max ? text : text.substring(0, max) + "...";
    }

    private static String json(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unwritable test case", e);
        }
    }

    private static <T> T read(String text, Class<T> type) {
        try {
            return JSON.readValue(text, type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unreadable test case", e);
        }
    }

    private static <T> T read(String text, TypeReference<T> type) {
        try {
            return JSON.readValue(text, type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unreadable test case", e);
        }
    }
}
