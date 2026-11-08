package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.ChatTurnResponse;
import com.taskforce.tf_api.core.dto.response.ModelCapabilityResponse;
import com.taskforce.tf_api.core.dto.response.ModelCapabilityResponse.CapabilityInfo;
import com.taskforce.tf_api.core.dto.response.ModelCapabilityResponse.Card;
import com.taskforce.tf_api.core.dto.response.ModelCapabilityResponse.CaseInfo;
import com.taskforce.tf_api.core.dto.response.ModelCapabilityResponse.CaseResult;
import com.taskforce.tf_api.core.dto.response.ModelCapabilityResponse.ModelRow;
import com.taskforce.tf_api.core.dto.response.ModelCapabilityResponse.Proposal;
import com.taskforce.tf_api.core.dto.response.ModelCapabilityResponse.RunStarted;
import com.taskforce.tf_api.core.dto.response.ModelCapabilityResponse.Score;
import com.taskforce.tf_api.core.model.AiModelChoice;
import com.taskforce.tf_api.core.model.ModelCapabilityResult;
import com.taskforce.tf_api.core.model.ModelCapabilityRun;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.AiModelChoiceRepository;
import com.taskforce.tf_api.core.repository.ModelCapabilityResultRepository;
import com.taskforce.tf_api.core.repository.ModelCapabilityRunRepository;
import com.taskforce.tf_api.core.service.AiStatusService;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.LlmToolsRefusedException;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.agent.CapabilitySuite.CapabilityCase;
import com.taskforce.tf_api.core.service.ai.ModelChoice;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Ce que sait faire chaque modèle (R113, séance n°16), et la proposition d'un modèle plus fort (R118, séance n°17).
 *
 * <ul>
 *   <li>La table : les modèles de conversation que la passerelle joint, et pour chacun la dernière note de chaque cas
 *       fixe de {@link CapabilitySuite}, avec sa date. Elle vaut pour l'instance : c'est le modèle de cette machine ou
 *       de ce serveur qu'on mesure, jamais d'après une fiche de fournisseur.</li>
 *   <li>La mesure : à la demande, un cas par requête, rejoué comme un cas de la banque ({@link AgentService#replay}),
 *       sous le quota et le frein de débit de l'IA de la personne qui la lance, et noté par du code.</li>
 *   <li>La proposition : pour chaque capacité, le premier modèle capable, dans l'ordre de la table ; la personne choisit
 *       (dans la webapp ici, dans l'app desktop dans ses réglages d'IA). Rien ne change de modèle sans elle.</li>
 *   <li>L'escalade : quand la banque dit que le modèle de Cortex échoue au genre d'une demande et qu'un modèle servi le
 *       réussit, TaskForce le dit dans la conversation et propose d'envoyer la demande à ce modèle, d'un clic.</li>
 * </ul>
 *
 * <p>Aucune transaction n'englobe un appel au modèle ni la lecture des modèles du fournisseur (PC-022) : chaque accès à
 * la base passe par son dépôt, une mesure enregistre sa note après coup.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ModelCapabilityService {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_ANSWER = 1000;
    private static final int MAX_MODEL = 128;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);
    /** L'ordre où TaskForce regarde le genre d'une demande : les outils d'abord, c'est le métier de Cortex. */
    private static final List<Capability> OFFER_ORDER =
        List.of(Capability.TOOLS, Capability.CONTEXT, Capability.CODE, Capability.FRENCH, Capability.ENGLISH);
    static final String TAKES_TOOLS = "takes Cortex's tools";
    static final String TOOLS_REFUSED = "The AI provider refused Cortex's tools for this model, even a single one: it can't "
        + "answer as Cortex.";

    private final BrainAccessGuard access;
    private final AiStatusService aiStatus;
    private final AgentService agent;
    private final AiUsageService aiUsage;
    private final ModelCapabilityRunRepository runs;
    private final ModelCapabilityResultRepository results;
    private final AiModelChoiceRepository choices;

    // -------------------------------------------------------------------------
    // La table
    // -------------------------------------------------------------------------

    /** La table, pour une personne de l'espace : tout membre la lit. */
    public ModelCapabilityResponse table(String slug, Long userId) {
        access.resolveAndAuthorize(slug, userId);
        return build(userId);
    }

    /** Ouvre une mesure d'un modèle servi : ses cas sont ceux de la suite, dans leur ordre. */
    public RunStarted start(String slug, Long userId, String model) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        String name = served(model);
        ModelCapabilityRun run = runs.save(ModelCapabilityRun.builder()
            .workspaceId(ws.getId()).startedBy(userId).startedAt(LocalDateTime.now()).model(name)
            .suiteVersion(CapabilitySuite.VERSION).total(CapabilitySuite.cases().size()).passed(0).build());
        return new RunStarted(run.getId(), name, run.getStartedAt(),
            CapabilitySuite.cases().stream().map(CapabilityCase::key).toList());
    }

    /**
     * Rejoue et note un cas d'une mesure, une seule fois. Le quota et le frein de débit de l'IA valent comme pour une
     * réponse ; une panne du modèle remonte telle quelle, sans note, pour qu'on rejoue le cas.
     */
    public CaseResult measure(String slug, Long userId, Long runId, String caseKey) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        ModelCapabilityRun run = runs.findByIdAndWorkspaceId(runId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("This measure was not found."));
        CapabilityCase capabilityCase = CapabilitySuite.find(caseKey)
            .orElseThrow(() -> new ResourceNotFoundException("This test case was not found."));
        Optional<ModelCapabilityResult> done = results.findByRunIdAndCaseKey(runId, caseKey);
        if (done.isPresent()) return result(done.get());
        if (run.getSuiteVersion() != CapabilitySuite.VERSION) {
            throw new BusinessException("This measure used older test cases: measure the model again.");
        }
        aiUsage.assertWithinQuota(ws.getId());
        ReplayOutcome outcome;
        EvalGrader.Grade grade;
        try {
            outcome = agent.replay(new AgentContext(slug, ws.getId(), userId), capabilityCase.replay(), run.getModel());
            grade = CapabilitySuite.grade(capabilityCase, outcome);
        } catch (LlmToolsRefusedException refused) {
            // Le fournisseur refuse les outils de Cortex pour ce modèle, même un seul (un modèle de base, sans gabarit
            // d'outils) : ce n'est pas une panne à rejouer, c'est une mesure, et le modèle ne peut pas répondre en Cortex.
            outcome = new ReplayOutcome("", List.of(), run.getModel(), LlmUsage.ZERO);
            grade = new EvalGrader.Grade(false, List.of(new EvalGrader.Check(TAKES_TOOLS, false, TOOLS_REFUSED)));
        }
        recordUsage(ws.getId(), outcome.usage());
        long prompt = outcome.usage() == null ? 0 : outcome.usage().promptTokens();
        Details details = new Details(grade.checks(), outcome.calls(), EvalService.shorten(outcome.answer(), MAX_ANSWER),
            outcome.model(), prompt);
        ModelCapabilityResult saved;
        try {
            saved = results.save(ModelCapabilityResult.builder().runId(runId).caseKey(caseKey)
                .capability(capabilityCase.capability().key()).passed(grade.passed()).details(json(details))
                .createdAt(LocalDateTime.now()).build());
        } catch (DataIntegrityViolationException twice) { // le même cas deux fois en même temps : le premier compte
            return results.findByRunIdAndCaseKey(runId, caseKey).map(this::result).orElseThrow(() -> twice);
        }
        settle(run);
        return result(saved);
    }

    /** Le modèle que la personne prend pour Cortex dans la webapp ; vide, elle revient à celui de l'instance. */
    public ModelCapabilityResponse choose(String slug, Long userId, String model) {
        access.resolveAndAuthorize(slug, userId);
        if (model == null || model.isBlank()) {
            choices.findById(userId).ifPresent(choices::delete);
        } else {
            choices.save(AiModelChoice.builder().userId(userId).model(served(model)).chosenAt(LocalDateTime.now()).build());
        }
        return build(userId);
    }

    // -------------------------------------------------------------------------
    // Le modèle de Cortex, et l'escalade (R118)
    // -------------------------------------------------------------------------

    /** Le modèle que la personne a choisi pour Cortex, s'il est encore servi ; sinon {@code null} (celui de l'instance). */
    public String chosenModel(Long userId) {
        AiStatusService.Snapshot snapshot = aiStatus.snapshot();
        return choices.findById(userId)
            .map(AiModelChoice::getModel)
            .filter(model -> ModelChoice.listed(snapshot.models(), model))
            .orElse(null);
    }

    /** Le modèle vers lequel la personne envoie une demande d'un clic : un modèle servi, ou {@code null} sans clic. */
    public String requestedModel(String model) {
        return model == null || model.isBlank() ? null : served(model);
    }

    /** Le modèle qui répond à la personne : le sien, sinon celui de l'instance (le palier rapide de Cortex). */
    public String cortexModel(String chosen) {
        return chosen != null ? chosen : aiStatus.current().fastModel();
    }

    /**
     * La proposition de TaskForce pour cette demande, quand la banque dit que {@code used} échoue à son genre et qu'un
     * autre modèle servi le réussit ; sinon vide. Les outils d'abord, puis la taille, le code, la langue.
     */
    public Optional<ChatTurnResponse.Escalation> offer(String message, List<Map<String, Object>> history, String used) {
        if (used == null || used.isBlank()) return Optional.empty();
        RequestKinds.Request request = RequestKinds.of(message, history);
        Measures measures = measures(aiStatus.snapshot());
        Map<Capability, Score> mine = measures.scores().get(used);
        if (mine == null) return Optional.empty(); // le modèle de Cortex n'est pas mesuré : la banque ne dit rien
        for (Capability capability : OFFER_ORDER) {
            Score score = mine.get(capability);
            if (score == null || score.measured() == 0) continue;
            Optional<ChatTurnResponse.Escalation> offer = capability == Capability.CONTEXT
                ? longer(measures, used, score, request.words())
                : request.kinds().contains(capability) ? stronger(measures, used, capability, score) : Optional.empty();
            if (offer.isPresent()) return offer;
        }
        return Optional.empty();
    }

    /** Ce que TaskForce écrit sous une réponse envoyée d'un clic au modèle choisi : la personne l'a demandé. */
    public static String sentNotice(String model) {
        return "Answered by " + model + ", as you asked.";
    }

    /**
     * Un bloc signé par TaskForce, que la conversation montre comme sa parole, pas celle du modèle (R116) ; « models »
     * dit qu'il parle du modèle qui répond, pas d'une correction.
     */
    public static String block(String text) {
        return "\n\n" + ActionClaimCheck.SIGNATURE + " · models\n> " + text;
    }

    /**
     * Le modèle échoue au moins un cas de la capacité ; le modèle mesuré sur tous ses cas qui en réussit le plus, et plus
     * que lui, la reçoit (à égalité, le premier de la table). La phrase dit ce que chacun a réussi.
     */
    private Optional<ChatTurnResponse.Escalation> stronger(Measures measures, String used, Capability capability,
                                                          Score score) {
        if (score.passed() >= score.measured()) return Optional.empty();
        String to = null;
        Score best = null;
        for (String model : measures.order()) {
            Score other = measures.scores().getOrDefault(model, Map.of()).get(capability);
            if (model.equals(used) || other == null || other.measured() < other.total()) continue;
            if (other.passed() > score.passed() && (best == null || other.passed() > best.passed())) {
                to = model;
                best = other;
            }
        }
        if (to == null) return Optional.empty();
        int failed = score.measured() - score.passed();
        String passed = best.capable() ? (best.total() > 1 ? "them all" : "it") : best.passed() + " of " + best.total();
        String text = used + " failed " + failed + " of " + score.measured() + " test case" + (score.measured() > 1 ? "s" : "")
            + " for " + capability.request() + " on " + score.measuredAt().format(DAY) + "; " + to + " passed " + passed
            + ". You can send this request to " + to + ".";
        return Optional.of(new ChatTurnResponse.Escalation(capability.key(), used, to, text));
    }

    /** La conversation dépasse ce que le modèle a tenu dans la banque ; le premier modèle qui a tenu assez la reçoit. */
    private Optional<ChatTurnResponse.Escalation> longer(Measures measures, String used, Score score, int words) {
        if (score.heldWords() == null || words <= score.heldWords()) return Optional.empty();
        return measures.order().stream()
            .filter(model -> !model.equals(used))
            .filter(model -> {
                Score other = measures.scores().getOrDefault(model, Map.of()).get(Capability.CONTEXT);
                return other != null && other.heldWords() != null && other.heldWords() >= words;
            })
            .findFirst()
            .map(to -> {
                int held = measures.scores().get(to).get(Capability.CONTEXT).heldWords();
                String text = "This conversation has about " + String.format(Locale.ENGLISH, "%,d", words)
                    + " words. In TaskForce's test cases on " + score.measuredAt().format(DAY) + ", " + used
                    + (score.heldWords() == 0 ? " held none of the documents"
                        : " held " + String.format(Locale.ENGLISH, "%,d", score.heldWords()) + " words at most")
                    + " and " + to + " held " + String.format(Locale.ENGLISH, "%,d", held)
                    + ". You can send this request to " + to + ".";
                return new ChatTurnResponse.Escalation(Capability.CONTEXT.key(), used, to, text);
            });
    }

    // -------------------------------------------------------------------------
    // Les notes, pour la table et l'escalade
    // -------------------------------------------------------------------------

    /** La dernière note de chaque cas, pour les modèles servis, dans l'ordre de la table. */
    private record Measures(List<String> order, Map<String, Map<Capability, Score>> scores,
                            Map<String, LocalDateTime> measuredAt) {
    }

    private record Latest(boolean passed, LocalDateTime at) {
    }

    private Measures measures(AiStatusService.Snapshot snapshot) {
        List<String> order = ModelChoice.chatModels(snapshot.settings().provider(), snapshot.models());
        Map<Long, String> modelOfRun = new HashMap<>();
        runs.findTop500BySuiteAndSuiteVersionOrderByStartedAtDesc(ModelCapabilityRun.CAPABILITY, CapabilitySuite.VERSION).stream()
            .filter(run -> order.contains(run.getModel()))
            .forEach(run -> modelOfRun.put(run.getId(), run.getModel()));
        Map<String, Map<String, Latest>> latest = new HashMap<>();
        if (!modelOfRun.isEmpty()) {
            for (ModelCapabilityResultRepository.Row row : results.findRowsByRunIdIn(modelOfRun.keySet())) {
                Map<String, Latest> byCase = latest.computeIfAbsent(modelOfRun.get(row.getRunId()), m -> new HashMap<>());
                Latest seen = byCase.get(row.getCaseKey());
                if (seen == null || row.getCreatedAt().isAfter(seen.at())) {
                    byCase.put(row.getCaseKey(), new Latest(Boolean.TRUE.equals(row.getPassed()), row.getCreatedAt()));
                }
            }
        }
        Map<String, Map<Capability, Score>> scores = new LinkedHashMap<>();
        Map<String, LocalDateTime> measuredAt = new HashMap<>();
        for (String model : order) {
            Map<String, Latest> byCase = latest.getOrDefault(model, Map.of());
            Map<Capability, Score> cells = new LinkedHashMap<>();
            for (Capability capability : Capability.values()) {
                cells.put(capability, score(capability, byCase));
            }
            scores.put(model, cells);
            byCase.values().stream().map(Latest::at).max(LocalDateTime::compareTo)
                .ifPresent(at -> measuredAt.put(model, at));
        }
        return new Measures(order, scores, measuredAt);
    }

    private static Score score(Capability capability, Map<String, Latest> byCase) {
        int passed = 0;
        int measured = 0;
        Integer held = null;
        LocalDateTime at = null;
        for (CapabilityCase c : CapabilitySuite.cases()) {
            if (c.capability() != capability || !byCase.containsKey(c.key())) continue;
            Latest note = byCase.get(c.key());
            measured++;
            if (capability == Capability.CONTEXT) held = held == null ? 0 : held;
            if (note.passed()) {
                passed++;
                if (capability == Capability.CONTEXT) held = Math.max(held, c.documentWords());
            }
            at = at == null || note.at().isAfter(at) ? note.at() : at;
        }
        int total = CapabilitySuite.count(capability);
        return new Score(capability.key(), passed, measured, total, measured == total && passed == total, held, at);
    }

    private ModelCapabilityResponse build(Long userId) {
        AiStatusService.Snapshot snapshot = aiStatus.snapshot();
        Measures measures = measures(snapshot);
        String instanceModel = snapshot.status().fastModel();
        String choice = choices.findById(userId).map(AiModelChoice::getModel).orElse(null);
        String current = choice != null && ModelChoice.listed(snapshot.models(), choice) ? choice : instanceModel;

        List<ModelRow> rows = measures.order().stream()
            .map(model -> new ModelRow(model, model.equals(current), measures.measuredAt().get(model),
                List.copyOf(measures.scores().get(model).values()), card(model)))
            .toList();
        List<Proposal> proposals = new ArrayList<>();
        for (Capability capability : Capability.values()) {
            measures.order().stream()
                .filter(model -> measures.scores().get(model).get(capability).capable())
                .findFirst()
                .ifPresent(model -> proposals.add(new Proposal(capability.key(), model)));
        }
        String proposed = measures.order().stream()
            .filter(model -> measures.scores().get(model).values().stream().allMatch(Score::capable))
            .findFirst()
            .orElse(null);
        List<CapabilityInfo> capabilities = Arrays.stream(Capability.values())
            .map(c -> new CapabilityInfo(c.key(), c.label(), c.description(), CapabilitySuite.count(c)))
            .toList();
        List<CaseInfo> cases = CapabilitySuite.cases().stream()
            .map(c -> new CaseInfo(c.key(), c.capability().key(), c.title()))
            .toList();
        String provider = snapshot.settings().enabled() ? snapshot.settings().provider().name() : null;
        return new ModelCapabilityResponse(provider, instanceModel, choice, current, CapabilitySuite.VERSION,
            capabilities, cases, rows, proposals, proposed);
    }

    // -------------------------------------------------------------------------
    // Le reste
    // -------------------------------------------------------------------------

    /** Le détail gardé avec une note. */
    record Details(List<EvalGrader.Check> checks, List<ReplayOutcome.ReplayCall> calls, String answer, String model,
                   long promptTokens) {
    }

    /** Ce que dit la fiche du modèle chez son fournisseur, ou {@code null} : une description, jamais une note (R113). */
    private Card card(String model) {
        return aiStatus.describe(model)
            .map(card -> new Card(card.parameters(), card.contextLength(), card.tools()))
            .orElse(null);
    }

    /** Un modèle de conversation que la passerelle sert maintenant ; sinon la personne apprend lesquels le sont. */
    private String served(String model) {
        String name = model == null ? "" : model.strip();
        if (name.isEmpty()) throw new BusinessException("Name a model.");
        if (name.length() > MAX_MODEL) throw new BusinessException("The model name is too long.");
        AiStatusService.Snapshot snapshot = aiStatus.snapshot();
        List<String> chat = ModelChoice.chatModels(snapshot.settings().provider(), snapshot.models());
        if (!snapshot.settings().enabled() || !chat.contains(name)) {
            throw new BusinessException(chat.isEmpty()
                ? "The AI of this instance serves no model right now."
                : "The AI of this instance doesn't serve " + name + ". It serves: " + String.join(", ", chat) + ".");
        }
        return name;
    }

    private void settle(ModelCapabilityRun run) {
        run.setPassed((int) results.countByRunIdAndPassedTrue(run.getId()));
        if (results.countByRunId(run.getId()) >= run.getTotal()) run.setFinishedAt(LocalDateTime.now());
        runs.save(run);
    }

    private void recordUsage(Long workspaceId, LlmUsage usage) {
        try {
            aiUsage.record(workspaceId, usage);
        } catch (RuntimeException e) {
            log.warn("Mesure des capacités : conso IA non comptée (ws={}) : {}", workspaceId, LogSafe.of(e.getMessage()));
        }
    }

    private CaseResult result(ModelCapabilityResult result) {
        Details details = read(result.getDetails());
        return new CaseResult(result.getCaseKey(), result.getCapability(), result.isPassed(), details.checks(),
            details.calls(), details.answer(), details.model(), details.promptTokens());
    }

    private static String json(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unwritable capability result", e);
        }
    }

    private static Details read(String text) {
        try {
            return JSON.readValue(text, Details.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unreadable capability result", e);
        }
    }

}
