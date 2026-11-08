package com.taskforce.tf_api.core.service.agent;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.IssueTypeResponse;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.CaseDetail;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.Cell;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.ModelDetail;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.ModelRow;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.RunStarted;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.TaskDetail;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.TaskInfo;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.TrialAnswer;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.TrialLetterAnswer;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.TrialResult;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.TrialStarted;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.model.ModelBlindTrial;
import com.taskforce.tf_api.core.model.ModelBlindTrialAnswer;
import com.taskforce.tf_api.core.model.ModelCapabilityResult;
import com.taskforce.tf_api.core.model.ModelCapabilityRun;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ModelBlindTrialAnswerRepository;
import com.taskforce.tf_api.core.repository.ModelBlindTrialRepository;
import com.taskforce.tf_api.core.repository.ModelCapabilityResultRepository;
import com.taskforce.tf_api.core.repository.ModelCapabilityRunRepository;
import com.taskforce.tf_api.core.service.AiStatusService;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.LlmToolsRefusedException;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.BenchmarkSuite.BenchmarkCase;
import com.taskforce.tf_api.core.service.ai.ModelChoice;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Le banc des modèles (R131, séance n°19) : « que puis-je confier à ce modèle ? ».
 *
 * <ul>
 *   <li>La matrice : pour chaque modèle servi et chaque tâche, un verdict en mots, tiré de la dernière note de chaque cas dans
 *       cet espace. Le modèle en service d'abord, puis l'ordre d'installation, jamais un classement (R57).</li>
 *   <li>Le passage : à la demande, un cas par requête ({@link BenchmarkSuite}), sous le quota et le frein de débit de l'IA de la
 *       personne, noté par du code, avec la réponse et son temps.</li>
 *   <li>Le verdict de la personne : elle retourne une note, et le verdict dit qu'il est le sien (R51, Duflo).</li>
 *   <li>L'essai à l'aveugle : une issue qu'elle lit, une tâche, deux ou trois modèles sous des lettres. Sans outil, rien ne
 *       s'écrit sur l'issue ; une réponse tirée d'une vraie issue n'est visible que de la personne qui l'a lancée.</li>
 * </ul>
 *
 * <p>Aucune transaction n'englobe un appel au modèle (PC-022) : chaque accès à la base passe par son dépôt, un cas enregistre
 * sa note après coup.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ModelBenchmarkService {

    static final String GIVE_IT = "give_it";
    static final String WITH_REVIEW = "with_review";
    static final String NOT_YET = "not_yet";
    static final String JUDGE_YOU = "you";
    static final String JUDGE_MEMBER = "member";

    /** Une réponse gardée, plafonnée : assez pour la juger en la lisant. */
    private static final int MAX_ANSWER = 6000;
    /** Le temps d'un cas quand aucun passage ne le dit encore : à la louche, celui d'un petit modèle local. */
    static final long DEFAULT_CASE_MS = 30_000;
    private static final List<String> LETTERS = List.of("A", "B", "C");
    private static final int MIN_TRIAL_MODELS = 2;
    private static final int MAX_TRIAL_MODELS = 3;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final BrainAccessGuard access;
    private final AiStatusService aiStatus;
    private final AgentService agent;
    private final AiUsageService aiUsage;
    private final ModelCapabilityService capabilities;
    private final IssueMaterial material;
    private final ScreenContext screens;
    private final ProjectService projects;
    private final IssueService issues;
    private final ModelCapabilityRunRepository runs;
    private final ModelCapabilityResultRepository results;
    private final ModelBlindTrialRepository trials;
    private final ModelBlindTrialAnswerRepository trialAnswers;

    // -------------------------------------------------------------------------
    // La matrice
    // -------------------------------------------------------------------------

    /** La matrice, pour une personne de l'espace : tout membre la lit. */
    public ModelBenchmarkResponse matrix(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        AiStatusService.Snapshot snapshot = aiStatus.snapshot();
        String current = current(userId);
        List<String> order = installedFirstInUse(snapshot, current);
        Map<String, Map<String, Note>> notes = notes(ws.getId(), order);
        long averageMs = averageMs(notes);
        List<ModelRow> rows = order.stream().map(model -> {
            Map<String, Note> byCase = notes.getOrDefault(model, Map.of());
            LocalDateTime last = byCase.values().stream().map(Note::at).max(LocalDateTime::compareTo).orElse(null);
            List<Cell> cells = Arrays.stream(BenchmarkTask.values()).map(task -> cell(task, byCase, userId)).toList();
            return new ModelRow(model, model.equals(current), last, estimateSeconds(byCase, averageMs), cells);
        }).toList();
        List<TaskInfo> tasks = Arrays.stream(BenchmarkTask.values())
            .map(task -> new TaskInfo(task.key(), task.label(), task.description(), BenchmarkSuite.count(task), task.trial()))
            .toList();
        String provider = snapshot.settings().enabled() ? snapshot.settings().provider().name() : null;
        return new ModelBenchmarkResponse(provider, current, BenchmarkSuite.VERSION, BenchmarkSuite.cases().size(), tasks, rows);
    }

    /** Le modèle en service d'abord, puis les modèles de conversation dans l'ordre où le fournisseur les liste. */
    private static List<String> installedFirstInUse(AiStatusService.Snapshot snapshot, String current) {
        List<String> chat = ModelChoice.chatModels(snapshot.settings().provider(), snapshot.models());
        List<String> installed = new ArrayList<>(snapshot.models().stream().filter(chat::contains).toList());
        if (installed.remove(current)) installed.add(0, current);
        return List.copyOf(installed);
    }

    private String current(Long userId) {
        return capabilities.cortexModel(capabilities.chosenModel(userId));
    }

    /** Le verdict d'une tâche : sur la dernière note de chacun de ses cas, jamais avant que tous ne soient passés. */
    private static Cell cell(BenchmarkTask task, Map<String, Note> byCase, Long userId) {
        int measured = 0;
        int passed = 0;
        String judge = null;
        for (BenchmarkCase benchmarkCase : BenchmarkSuite.cases()) {
            Note note = benchmarkCase.task() == task ? byCase.get(benchmarkCase.key()) : null;
            if (note == null) continue;
            measured++;
            if (note.passed()) passed++;
            String who = note.judge(userId);
            // « Yours » l'emporte : la personne qui lit voit d'abord ce qui est à elle.
            if (who != null && !JUDGE_YOU.equals(judge)) judge = who;
        }
        int total = BenchmarkSuite.count(task);
        return new Cell(task.key(), verdict(passed, measured, total), passed, measured, total, judge);
    }

    /** Tous les cas : Give it ; au moins la moitié : With review ; moins : Not yet ; rien tant que la tâche n'est pas passée. */
    static String verdict(int passed, int measured, int total) {
        if (measured < total) return null;
        if (passed == total) return GIVE_IT;
        return passed * 2 >= total ? WITH_REVIEW : NOT_YET;
    }

    /** Combien de temps prendrait un passage de ce modèle : ses derniers temps, et la moyenne pour ce qu'il n'a pas passé. */
    private static long estimateSeconds(Map<String, Note> byCase, long averageMs) {
        long total = 0;
        for (BenchmarkCase benchmarkCase : BenchmarkSuite.cases()) {
            Note note = byCase.get(benchmarkCase.key());
            total += note != null && note.durationMs() != null ? note.durationMs() : averageMs;
        }
        return Math.max(1, total / 1000);
    }

    private static long averageMs(Map<String, Map<String, Note>> notes) {
        return Math.round(notes.values().stream().flatMap(byCase -> byCase.values().stream())
            .filter(note -> note.durationMs() != null).mapToLong(Note::durationMs).average().orElse(DEFAULT_CASE_MS));
    }

    // -------------------------------------------------------------------------
    // Le passage
    // -------------------------------------------------------------------------

    /** Ouvre un passage d'un modèle servi : ses cas sont ceux de la suite, dans leur ordre. */
    public RunStarted start(String slug, Long userId, String model) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        String name = served(model);
        ModelCapabilityRun run = runs.save(ModelCapabilityRun.builder()
            .workspaceId(ws.getId()).startedBy(userId).startedAt(LocalDateTime.now()).model(name)
            .suite(BenchmarkSuite.SUITE).suiteVersion(BenchmarkSuite.VERSION).total(BenchmarkSuite.cases().size()).passed(0).build());
        return new RunStarted(run.getId(), name, run.getStartedAt(), BenchmarkSuite.cases().stream().map(BenchmarkCase::key).toList());
    }

    /**
     * Joue et note un cas d'un passage, une seule fois. Le quota et le frein de débit de l'IA valent comme pour une réponse ; une
     * panne du modèle remonte telle quelle, sans note, pour qu'on rejoue le cas.
     */
    public CaseDetail play(String slug, Long userId, Long runId, String caseKey) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        ModelCapabilityRun run = run(ws, runId);
        BenchmarkCase benchmarkCase = BenchmarkSuite.find(caseKey)
            .orElseThrow(() -> new ResourceNotFoundException("This test case was not found."));
        var done = results.findByRunIdAndCaseKey(runId, caseKey);
        if (done.isPresent()) return detail(benchmarkCase, done.get(), userId);
        if (run.getSuiteVersion() != BenchmarkSuite.VERSION) {
            throw new BusinessException("This run used older test cases: run the model again.");
        }
        aiUsage.assertWithinQuota(ws.getId());
        long started = System.nanoTime();
        ReplayOutcome outcome;
        EvalGrader.Grade grade;
        try {
            outcome = benchmarkCase.usesTools()
                ? agent.replay(new AgentContext(slug, ws.getId(), userId), benchmarkCase.replay(), run.getModel())
                : agent.answerFrom(benchmarkCase.material(), benchmarkCase.question(), BenchmarkSuite.ASKED_ON, run.getModel());
            grade = BenchmarkSuite.grade(benchmarkCase, outcome);
        } catch (LlmToolsRefusedException refused) {
            // Le fournisseur refuse les outils pour ce modèle : ce n'est pas une panne à rejouer, il ne peut pas faire Act.
            outcome = new ReplayOutcome("", List.of(), run.getModel(), LlmUsage.ZERO);
            grade = new EvalGrader.Grade(false, List.of(new EvalGrader.Check(ModelCapabilityService.TAKES_TOOLS, false,
                ModelCapabilityService.TOOLS_REFUSED)));
        }
        long durationMs = (System.nanoTime() - started) / 1_000_000;
        recordUsage(ws.getId(), outcome.usage());
        long prompt = outcome.usage() == null ? 0 : outcome.usage().promptTokens();
        Details details = new Details(grade.checks(), outcome.calls(), EvalService.shorten(outcome.answer(), MAX_ANSWER), outcome.model(), prompt);
        ModelCapabilityResult saved;
        try {
            saved = results.save(ModelCapabilityResult.builder().runId(runId).caseKey(caseKey)
                .capability(benchmarkCase.task().key()).passed(grade.passed()).details(json(details)).durationMs(durationMs)
                .createdAt(LocalDateTime.now()).build());
        } catch (DataIntegrityViolationException twice) { // le même cas deux fois en même temps : le premier compte
            return results.findByRunIdAndCaseKey(runId, caseKey).map(result -> detail(benchmarkCase, result, userId)).orElseThrow(() -> twice);
        }
        settle(run);
        return detail(benchmarkCase, saved, userId);
    }

    /** Un passage de cet espace, de la suite du banc ; sinon rien, ni pour un autre espace, ni pour une mesure de capacité. */
    private ModelCapabilityRun run(Workspace ws, Long runId) {
        return runs.findByIdAndWorkspaceId(runId, ws.getId())
            .filter(run -> BenchmarkSuite.SUITE.equals(run.getSuite()))
            .orElseThrow(() -> new ResourceNotFoundException("This run was not found."));
    }

    private void settle(ModelCapabilityRun run) {
        run.setPassed((int) results.countByRunIdAndPassedTrue(run.getId()));
        if (results.countByRunId(run.getId()) >= run.getTotal()) run.setFinishedAt(LocalDateTime.now());
        runs.save(run);
    }

    // -------------------------------------------------------------------------
    // Le détail, et le verdict de la personne
    // -------------------------------------------------------------------------

    /** Par tâche et par cas : la réponse, le temps, les critères ; et les essais à l'aveugle de la personne qui lit. */
    public ModelDetail detail(String slug, Long userId, String model) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        return detail(ws, userId, model);
    }

    private ModelDetail detail(Workspace ws, Long userId, String model) {
        Map<String, Note> byCase = notes(ws.getId(), List.of(model)).getOrDefault(model, Map.of());
        Map<Long, ModelCapabilityResult> full = results.findAllById(byCase.values().stream().map(Note::resultId).toList()).stream()
            .collect(Collectors.toMap(ModelCapabilityResult::getId, Function.identity()));
        List<TaskDetail> tasks = Arrays.stream(BenchmarkTask.values()).map(task -> {
            Cell cell = cell(task, byCase, userId);
            List<CaseDetail> cases = BenchmarkSuite.cases().stream().filter(c -> c.task() == task).map(c -> {
                Note note = byCase.get(c.key());
                ModelCapabilityResult result = note == null ? null : full.get(note.resultId());
                return result == null ? unplayed(c) : detail(c, result, userId);
            }).toList();
            return new TaskDetail(task.key(), cell.verdict(), cell.passed(), cell.measured(), cell.total(), cell.judge(), cases);
        }).toList();
        LocalDateTime last = byCase.values().stream().map(Note::at).max(LocalDateTime::compareTo).orElse(null);
        return new ModelDetail(model, model.equals(current(userId)), last, BenchmarkSuite.cases().size(), tasks,
            trialsWith(ws.getId(), userId, model));
    }

    /** Retourne une note, ou la rend au code ({@code null}) ; le détail du modèle, à jour. */
    public ModelDetail overturn(String slug, Long userId, Long resultId, Boolean passed) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        ModelCapabilityResult result = results.findById(resultId)
            .orElseThrow(() -> new ResourceNotFoundException("This result was not found."));
        ModelCapabilityRun run = run(ws, result.getRunId());
        result.setPersonPassed(passed);
        result.setPersonId(passed == null ? null : userId);
        result.setPersonAt(passed == null ? null : LocalDateTime.now());
        results.save(result);
        return detail(ws, userId, run.getModel());
    }

    private static CaseDetail unplayed(BenchmarkCase benchmarkCase) {
        return new CaseDetail(null, benchmarkCase.key(), benchmarkCase.title(), false, false, null, null, List.of(), List.of(), "", null, null);
    }

    private static CaseDetail detail(BenchmarkCase benchmarkCase, ModelCapabilityResult result, Long userId) {
        Details details = read(result.getDetails());
        Boolean person = result.getPersonPassed();
        return new CaseDetail(result.getId(), benchmarkCase.key(), benchmarkCase.title(), person != null ? person : result.isPassed(),
            result.isPassed(), person, judge(person, result.getPersonId(), userId), details.checks(), details.calls(), details.answer(),
            result.getDurationMs(), result.getCreatedAt());
    }

    private static String judge(Boolean person, Long personId, Long userId) {
        if (person == null) return null;
        return userId.equals(personId) ? JUDGE_YOU : JUDGE_MEMBER;
    }

    // -------------------------------------------------------------------------
    // L'essai à l'aveugle
    // -------------------------------------------------------------------------

    /** Ouvre un essai sur une issue que la personne lit : les modèles tirés au hasard sous A, B, C ; aucun nom n'en sort. */
    public TrialStarted startTrial(String slug, Long userId, Long projectId, Long issueId, String taskKey, List<String> models) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        BenchmarkTask task = BenchmarkTask.of(taskKey).filter(BenchmarkTask::trial)
            .orElseThrow(() -> new BusinessException("This task can't be tried on an issue."));
        Set<String> names = new LinkedHashSet<>();
        for (String model : models == null ? List.<String>of() : models) names.add(served(model));
        if (names.size() < MIN_TRIAL_MODELS || names.size() > MAX_TRIAL_MODELS) {
            throw new BusinessException("Choose two or three different models.");
        }
        IssueMaterial.Read read = read(ws, slug, userId, projectId, issueId, task);
        List<String> shuffled = new ArrayList<>(names);
        Collections.shuffle(shuffled, RANDOM);
        ModelBlindTrial trial = trials.save(ModelBlindTrial.builder().workspaceId(ws.getId()).userId(userId).projectId(projectId)
            .issueId(issueId).issueKey(read.issues().get(0).key()).task(task.key()).startedAt(LocalDateTime.now()).build());
        List<String> letters = new ArrayList<>();
        for (int i = 0; i < shuffled.size(); i++) {
            trialAnswers.save(ModelBlindTrialAnswer.builder().trialId(trial.getId()).letter(LETTERS.get(i)).model(shuffled.get(i)).build());
            letters.add(LETTERS.get(i));
        }
        return new TrialStarted(trial.getId(), task.key(), trial.getIssueKey(), List.copyOf(letters));
    }

    /**
     * Fait répondre le modèle d'une lettre, une seule fois : l'issue est relue avec les droits de la personne, sans outil, et rien ne
     * s'écrit sur elle. Le modèle n'est pas nommé.
     */
    public TrialLetterAnswer playTrial(String slug, Long userId, Long trialId, String letter) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        ModelBlindTrial trial = mine(ws, userId, trialId);
        ModelBlindTrialAnswer answer = trialAnswers.findByTrialIdAndLetter(trialId, letter)
            .orElseThrow(() -> new ResourceNotFoundException("This answer was not found."));
        if (answer.getAnswer() != null) return new TrialLetterAnswer(answer.getLetter(), answer.getAnswer(), answer.getDurationMs());
        if (trial.getDecidedAt() != null) throw new BusinessException("This trial is decided.");
        aiUsage.assertWithinQuota(ws.getId());
        BenchmarkTask task = BenchmarkTask.of(trial.getTask()).orElseThrow();
        IssueMaterial.Read read = read(ws, slug, userId, trial.getProjectId(), trial.getIssueId(), task);
        long started = System.nanoTime();
        ReplayOutcome outcome = agent.answerFrom(materialText(ws, slug, userId, trial.getProjectId(), read),
            question(slug, userId, trial.getProjectId(), task), LocalDate.now(ZoneOffset.UTC), answer.getModel());
        long durationMs = (System.nanoTime() - started) / 1_000_000;
        recordUsage(ws.getId(), outcome.usage());
        answer.setAnswer(EvalService.shorten(outcome.answer(), MAX_ANSWER));
        answer.setDurationMs(durationMs);
        trialAnswers.save(answer);
        return new TrialLetterAnswer(answer.getLetter(), answer.getAnswer(), durationMs);
    }

    /** Le choix de la personne, une seule fois : une lettre, ou aucune ({@code null}) ; les noms apparaissent. */
    public TrialResult chooseTrial(String slug, Long userId, Long trialId, String letter) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        ModelBlindTrial trial = mine(ws, userId, trialId);
        List<ModelBlindTrialAnswer> answers = trialAnswers.findByTrialIdOrderByLetterAsc(trialId);
        if (trial.getDecidedAt() != null) return result(trial, answers);
        if (answers.stream().anyMatch(answer -> answer.getAnswer() == null)) {
            throw new BusinessException("Every answer must arrive before you choose.");
        }
        String chosen = letter == null || letter.isBlank() ? null : letter.strip();
        if (chosen != null && answers.stream().noneMatch(answer -> answer.getLetter().equals(chosen))) {
            throw new ResourceNotFoundException("This answer was not found.");
        }
        trial.setChosenLetter(chosen);
        trial.setDecidedAt(LocalDateTime.now());
        trials.save(trial);
        return result(trial, answers);
    }

    /** Un essai de cette personne ; pour toute autre, il n'existe pas. */
    private ModelBlindTrial mine(Workspace ws, Long userId, Long trialId) {
        return trials.findByIdAndWorkspaceIdAndUserId(trialId, ws.getId(), userId)
            .orElseThrow(() -> new ResourceNotFoundException("This trial was not found."));
    }

    /** Ses essais tranchés où ce modèle a répondu, les plus récents d'abord. Ceux d'une autre personne ne sortent jamais. */
    private List<TrialResult> trialsWith(Long workspaceId, Long userId, String model) {
        List<ModelBlindTrial> decided = trials.findTop30ByWorkspaceIdAndUserIdAndDecidedAtIsNotNullOrderByDecidedAtDesc(workspaceId, userId);
        if (decided.isEmpty()) return List.of();
        Map<Long, List<ModelBlindTrialAnswer>> answers = trialAnswers
            .findByTrialIdInOrderByLetterAsc(decided.stream().map(ModelBlindTrial::getId).toList()).stream()
            .collect(Collectors.groupingBy(ModelBlindTrialAnswer::getTrialId));
        return decided.stream()
            .filter(trial -> answers.getOrDefault(trial.getId(), List.of()).stream().anyMatch(answer -> model.equals(answer.getModel())))
            .map(trial -> result(trial, answers.get(trial.getId())))
            .toList();
    }

    private static TrialResult result(ModelBlindTrial trial, List<ModelBlindTrialAnswer> answers) {
        String chosenModel = answers.stream().filter(answer -> answer.getLetter().equals(trial.getChosenLetter()))
            .map(ModelBlindTrialAnswer::getModel).findFirst().orElse(null);
        return new TrialResult(trial.getId(), trial.getTask(), trial.getIssueKey(), trial.getChosenLetter(), chosenModel, trial.getDecidedAt(),
            answers.stream().map(answer -> new TrialAnswer(answer.getLetter(), answer.getModel(),
                answer.getAnswer() == null ? "" : answer.getAnswer(), answer.getDurationMs())).toList());
    }

    /** L'issue, comme un résumé la lit, avec les droits de la personne ; une issue qu'elle ne voit pas n'existe pas pour elle. */
    private IssueMaterial.Read read(Workspace ws, String slug, Long userId, Long projectId, Long issueId, BenchmarkTask task) {
        IssueMaterial.Read read = material.read(new AgentContext(slug, ws.getId(), userId), task.ask(), List.of(new Screen(projectId, issueId)),
            task == BenchmarkTask.SUMMARIZE);
        if (read.isEmpty() || read.issues().isEmpty()) throw new ResourceNotFoundException("This issue was not found.");
        return read;
    }

    /** Ce que le modèle lit : le tableau du projet, lu avec les droits de la personne, puis l'issue. */
    private String materialText(Workspace ws, String slug, Long userId, Long projectId, IssueMaterial.Read read) {
        ScreenContext.Seen board = screens.attached(new AgentContext(slug, ws.getId(), userId), projectId);
        return board == null || board.isEmpty() ? read.text() : board.text().strip() + "\n\n" + read.text();
    }

    /** La consigne de la tâche ; le tri nomme les types et les labels du projet, seuls choix permis. */
    private String question(String slug, Long userId, Long projectId, BenchmarkTask task) {
        if (task != BenchmarkTask.TRIAGE) return task.ask();
        String types = issues.listTypes(slug, projectId, userId).stream().map(IssueTypeResponse::getName).collect(Collectors.joining(", "));
        String labels = projects.listLabels(slug, projectId, userId).stream().map(ProjectLabelResponse::getName).collect(Collectors.joining(", "));
        return task.ask() + " The project's types: " + (types.isEmpty() ? "none" : types) + ". The project's labels: "
            + (labels.isEmpty() ? "none" : labels) + ".";
    }

    // -------------------------------------------------------------------------
    // Le reste
    // -------------------------------------------------------------------------

    /** La dernière note d'un cas, sans sa réponse : ce que la matrice et le verdict lisent. */
    private record Note(Long resultId, boolean passed, Long durationMs, Boolean person, Long personId, LocalDateTime at) {
        String judge(Long userId) {
            return ModelBenchmarkService.judge(person, personId, userId);
        }
    }

    /** La dernière note de chaque cas de la suite, pour ces modèles, dans cet espace. */
    private Map<String, Map<String, Note>> notes(Long workspaceId, Collection<String> models) {
        Map<Long, String> modelOfRun = new HashMap<>();
        runs.findTop200ByWorkspaceIdAndSuiteAndSuiteVersionOrderByStartedAtDesc(workspaceId, BenchmarkSuite.SUITE, BenchmarkSuite.VERSION).stream()
            .filter(run -> models.contains(run.getModel()))
            .forEach(run -> modelOfRun.put(run.getId(), run.getModel()));
        Map<String, Map<String, Note>> notes = new HashMap<>();
        if (modelOfRun.isEmpty()) return notes;
        for (ModelCapabilityResultRepository.BenchmarkRow row : results.findBenchmarkRowsByRunIdIn(modelOfRun.keySet())) {
            Map<String, Note> byCase = notes.computeIfAbsent(modelOfRun.get(row.getRunId()), model -> new HashMap<>());
            Note seen = byCase.get(row.getCaseKey());
            if (seen == null || row.getCreatedAt().isAfter(seen.at())) {
                boolean passed = row.getPersonPassed() != null ? row.getPersonPassed() : Boolean.TRUE.equals(row.getPassed());
                byCase.put(row.getCaseKey(), new Note(row.getId(), passed, row.getDurationMs(), row.getPersonPassed(), row.getPersonId(), row.getCreatedAt()));
            }
        }
        return notes;
    }

    /** Le détail gardé avec une note. */
    record Details(List<EvalGrader.Check> checks, List<ReplayOutcome.ReplayCall> calls, String answer, String model, long promptTokens) {
    }

    private String served(String model) {
        String name = capabilities.requestedModel(model);
        if (name == null) throw new BusinessException("Name a model.");
        return name;
    }

    private void recordUsage(Long workspaceId, LlmUsage usage) {
        try {
            aiUsage.record(workspaceId, usage);
        } catch (RuntimeException e) {
            log.warn("Banc des modèles : conso IA non comptée (ws={}) : {}", workspaceId, LogSafe.of(e.getMessage()));
        }
    }

    private static String json(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unwritable benchmark result", e);
        }
    }

    private static Details read(String text) {
        try {
            return JSON.readValue(text, Details.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unreadable benchmark result", e);
        }
    }
}
