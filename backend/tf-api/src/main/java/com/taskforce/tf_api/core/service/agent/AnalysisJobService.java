package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.request.EditPriorityRequest;
import com.taskforce.tf_api.core.dto.response.AnalysisJobResponse;
import com.taskforce.tf_api.core.dto.response.DecisionBrief;
import com.taskforce.tf_api.core.dto.response.DecisionBrief.Snapshot;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.StoredBriefResponse;
import com.taskforce.tf_api.core.dto.response.StoredPriorityResponse;
import com.taskforce.tf_api.core.enums.AnalysisDepth;
import com.taskforce.tf_api.core.enums.AnalysisJobStatus;
import com.taskforce.tf_api.core.enums.DecisionPriorityStatus;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.model.AnalysisJob;
import com.taskforce.tf_api.core.model.DecisionBriefEntity;
import com.taskforce.tf_api.core.model.DecisionPriority;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.AnalysisJobRepository;
import com.taskforce.tf_api.core.repository.DecisionBriefRepository;
import com.taskforce.tf_api.core.repository.DecisionPriorityRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Persistance et transactions des <b>workflows d'analyse IA</b>.
 *
 * <p>Ce service ne raisonne pas : il crée, met à jour et expose les workflows. L'exécution (les
 * étapes, le LLM, la boucle HITL) vit dans {@link AnalysisJobRunner}, qui appelle ici les petites
 * unités transactionnelles ci-dessous et laisse ce service pousser l'état sur STOMP.
 *
 * <p><b>Piège assumé</b> : {@link #launch} et {@link #answer} ne déclenchent pas le runner
 * eux-mêmes. Un {@code @Async} lancé depuis une méthode {@code @Transactional} peut démarrer
 * avant le commit et ne pas voir la ligne. C'est le contrôleur qui déclenche le runner, une fois
 * la transaction validée.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AnalysisJobService {

    private final BrainAccessGuard           access;
    private final AnalysisJobRepository      jobRepository;
    private final DecisionBriefRepository    briefRepository;
    private final DecisionPriorityRepository priorityRepository;
    private final ProjectRepository          projectRepository;
    private final UserRepository             userRepository;
    private final IssueRepository            issueRepository;
    private final IssueService               issueService;
    private final SimpMessagingTemplate      messagingTemplate;
    private final ObjectMapper               objectMapper;
    private final ProjectVisibilityGuard     visibilityGuard;

    /** Contexte figé passé au runner : entités détachées, aucun accès paresseux hors transaction. */
    public record JobContext(Long workspaceId, Project project, AnalysisDepth depth, String answer) {}

    // =========================================================================
    // Cycle de vie du workflow (API publique)
    // =========================================================================

    /** Crée un workflow en attente. Le contrôleur déclenche le runner après le commit. */
    @Transactional
    public AnalysisJobResponse launch(String slug, Long projectId, Long userId, AnalysisDepth depth) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Project project = projectRepository.findByIdAndWorkspaceId(projectId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Project", "id", projectId));
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        AnalysisDepth resolved = depth != null ? depth : AnalysisDepth.QUICK;
        AnalysisJob job = jobRepository.save(AnalysisJob.builder()
            .workspace(ws)
            .project(project)
            .user(user)
            .depth(resolved)
            .status(AnalysisJobStatus.QUEUED)
            .planJson(AnalysisPlan.initial(objectMapper, resolved == AnalysisDepth.DEEP).toJson())
            .build());

        return publish(job);
    }

    /** Workflows visibles du workspace (le dock). */
    @Transactional(readOnly = true)
    public List<AnalysisJobResponse> list(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        // Scope TF-RBAC-INTEL : ne rendre que les workflows des projets visibles par l'utilisateur.
        java.util.Set<Long> viewable = new java.util.HashSet<>(visibilityGuard.viewableProjectIds(ws.getId(), userId));
        return jobRepository.findVisibleByWorkspaceId(ws.getId()).stream()
            .filter(j -> j.getProject() != null && viewable.contains(j.getProject().getId()))
            .map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public AnalysisJobResponse get(String slug, Long jobId, Long userId) {
        return toResponse(requireJob(slug, jobId, userId));
    }

    /**
     * Réponse humaine à la question du modèle (HITL) : le workflow repasse en RUNNING.
     * Le contrôleur relance le runner après le commit.
     */
    @Transactional
    public AnalysisJobResponse answer(String slug, Long jobId, Long userId, String answer) {
        AnalysisJob job = requireJob(slug, jobId, userId);
        if (job.getStatus() != AnalysisJobStatus.WAITING_FOR_INPUT) {
            throw new BusinessException("Ce workflow n'attend pas de réponse");
        }
        job.setAnswer(answer);
        job.setQuestion(null);
        job.setStatus(AnalysisJobStatus.RUNNING);
        return publish(job);
    }

    /** Retire le workflow du dock sans effacer sa trace. */
    @Transactional
    public void dismiss(String slug, Long jobId, Long userId) {
        AnalysisJob job = requireJob(slug, jobId, userId);
        if (job.getStatus().isActive()) {
            throw new BusinessException("Impossible de retirer un workflow en cours");
        }
        job.setDismissed(true);
    }

    // =========================================================================
    // Unités transactionnelles appelées par le runner
    // =========================================================================

    /** Passe le workflow en RUNNING et démarre la première étape. */
    @Transactional
    public JobContext startJob(Long jobId) {
        AnalysisJob job = jobRepository.findById(jobId)
            .orElseThrow(() -> new ResourceNotFoundException("Workflow introuvable: " + jobId));
        job.setStatus(AnalysisJobStatus.RUNNING);
        job.setError(null);
        applyPlan(job, plan -> plan.status(AnalysisPlan.OBSERVE, AnalysisPlan.IN_PROGRESS));
        publish(job);

        // Le projet est chargé pour de bon (et non laissé en proxy paresseux) : le runner le lit
        // hors transaction, une association non initialisée y lèverait LazyInitializationException.
        Project project = projectRepository.findById(job.getProject().getId())
            .orElseThrow(() -> new ResourceNotFoundException("Project", "id", job.getProject().getId()));

        return new JobContext(job.getWorkspace().getId(), project, job.getDepth(), job.getAnswer());
    }

    @Transactional
    public void step(Long jobId, String stepId, String status) {
        AnalysisJob job = jobRepository.findById(jobId).orElseThrow();
        applyPlan(job, plan -> plan.status(stepId, status));
        publish(job);
    }

    /** Suspend le workflow sur une question du modèle (HITL). */
    @Transactional
    public void suspend(Long jobId, String question) {
        AnalysisJob job = jobRepository.findById(jobId).orElseThrow();
        job.setStatus(AnalysisJobStatus.WAITING_FOR_INPUT);
        job.setQuestion(question);
        applyPlan(job, plan -> plan
            .status(AnalysisPlan.ANALYZE, AnalysisPlan.COMPLETED)
            .status(AnalysisPlan.CLARIFY, AnalysisPlan.NEED_HELP));
        publish(job);
    }

    /** Persiste le brief produit et termine le workflow. */
    @Transactional
    public void complete(Long jobId, DecisionBrief brief) {
        AnalysisJob job = jobRepository.findById(jobId).orElseThrow();
        DecisionBriefEntity entity = persistBrief(job, brief);

        job.setBrief(entity);
        job.setStatus(AnalysisJobStatus.DONE);
        applyPlan(job, plan -> plan.status(AnalysisPlan.PERSIST, AnalysisPlan.COMPLETED));
        publish(job);
    }

    @Transactional
    public void fail(Long jobId, String message) {
        AnalysisJob job = jobRepository.findById(jobId).orElseThrow();
        job.setStatus(AnalysisJobStatus.FAILED);
        job.setError(message);
        applyPlan(job, AnalysisPlan::failRunning);
        publish(job);
    }

    // =========================================================================
    // Brief persisté + actions sur les priorités
    // =========================================================================

    /** Dernier brief d'un projet — {@code null} si aucune analyse n'a encore abouti. */
    @Transactional(readOnly = true)
    public StoredBriefResponse latestBrief(String slug, Long projectId, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Project project = projectRepository.findByIdAndWorkspaceId(projectId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Project", "id", projectId));
        visibilityGuard.assertCanView(project, userId);  // TF-RBAC-INTEL : brief scopé aux projets visibles
        return briefRepository.findFirstByProjectIdOrderByCreatedAtDesc(projectId)
            .map(this::toResponse)
            .orElse(null);
    }

    /** Accepte une priorité : crée l'issue correspondante et garde le lien décision → exécution. */
    @Transactional
    public StoredPriorityResponse accept(String slug, Long priorityId, Long userId) {
        DecisionPriority priority = requirePriority(slug, priorityId, userId);
        if (priority.getStatus() == DecisionPriorityStatus.ACCEPTED) {
            return toResponse(priority);  // idempotent : l'issue existe déjà
        }
        Long projectId = priority.getBrief().getProject().getId();

        CreateIssueRequest request = new CreateIssueRequest();
        request.setTitle(priority.getTitle());
        request.setDescription(priority.getRationale());
        request.setPriority(issuePriority(priority.getLevel()));

        IssueResponse issue = issueService.createIssue(slug, projectId, request, userId);
        Issue created = issueRepository.findById(issue.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Issue", "id", issue.getId()));

        priority.setIssue(created);
        priority.setStatus(DecisionPriorityStatus.ACCEPTED);
        return toResponse(priority);
    }

    /** Épingle / détache une priorité (bascule). */
    @Transactional
    public StoredPriorityResponse pin(String slug, Long priorityId, Long userId) {
        DecisionPriority priority = requirePriority(slug, priorityId, userId);
        priority.setStatus(priority.getStatus() == DecisionPriorityStatus.PINNED
            ? DecisionPriorityStatus.NEW
            : DecisionPriorityStatus.PINNED);
        return toResponse(priority);
    }

    /**
     * Écarte une priorité — signal négatif conservé comme feedback. Réversible (bascule) : un
     * écart est un jugement de l'humain, pas une suppression, et il peut se raviser.
     */
    @Transactional
    public StoredPriorityResponse dismissPriority(String slug, Long priorityId, Long userId) {
        DecisionPriority priority = requirePriority(slug, priorityId, userId);
        if (priority.getStatus() == DecisionPriorityStatus.ACCEPTED) {
            throw new BusinessException("Cette priorité a déjà été transformée en issue");
        }
        priority.setStatus(priority.getStatus() == DecisionPriorityStatus.DISMISSED
            ? DecisionPriorityStatus.NEW
            : DecisionPriorityStatus.DISMISSED);
        return toResponse(priority);
    }

    /** Édite une priorité avant acceptation (l'humain garde la main sur la formulation). */
    @Transactional
    public StoredPriorityResponse edit(String slug, Long priorityId, Long userId, EditPriorityRequest request) {
        DecisionPriority priority = requirePriority(slug, priorityId, userId);
        if (priority.getStatus() == DecisionPriorityStatus.ACCEPTED) {
            throw new BusinessException("Cette priorité a déjà été transformée en issue");
        }
        if (request.getTitle() != null && !request.getTitle().isBlank()) {
            priority.setTitle(request.getTitle().trim());
        }
        if (request.getRationale() != null) {
            priority.setRationale(request.getRationale().trim());
        }
        return toResponse(priority);
    }

    // =========================================================================
    // Interne
    // =========================================================================

    private DecisionBriefEntity persistBrief(AnalysisJob job, DecisionBrief brief) {
        Snapshot s = brief.snapshot();
        DecisionBriefEntity entity = DecisionBriefEntity.builder()
            .workspace(job.getWorkspace())
            .project(job.getProject())
            .situation(brief.situation() != null ? brief.situation() : "")
            .risksJson(writeJson(brief.risks()))
            .snapshotTotal(s.total())
            .snapshotOpen(s.open())
            .snapshotInProgress(s.inProgress())
            .snapshotCompleted(s.completed())
            .snapshotOverdue(s.overdue())
            .snapshotDueSoon(s.dueSoon())
            .mode(brief.mode())
            .build();

        int position = 0;
        for (DecisionBrief.Priority p : brief.priorities()) {
            entity.addPriority(DecisionPriority.builder()
                .level(p.level())
                .title(truncate(p.title(), 500))
                .rationale(p.rationale() != null ? p.rationale() : "")
                .status(DecisionPriorityStatus.NEW)
                .position(position++)
                .build());
        }
        return briefRepository.save(entity);
    }

    private AnalysisJob requireJob(String slug, Long jobId, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        AnalysisJob job = jobRepository.findByIdAndWorkspaceId(jobId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Workflow introuvable: " + jobId));
        visibilityGuard.assertCanView(job.getProject(), userId);  // TF-RBAC-INTEL
        return job;
    }

    private DecisionPriority requirePriority(String slug, Long priorityId, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        DecisionPriority priority = priorityRepository.findByIdAndWorkspaceId(priorityId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Priorité introuvable: " + priorityId));
        visibilityGuard.assertCanView(priority.getBrief().getProject(), userId);  // TF-RBAC-INTEL
        return priority;
    }

    /** Mute le plan stocké puis le réécrit. */
    private void applyPlan(AnalysisJob job, java.util.function.UnaryOperator<AnalysisPlan> mutation) {
        AnalysisPlan plan = AnalysisPlan.parse(objectMapper, job.getPlanJson());
        job.setPlanJson(mutation.apply(plan).toJson());
    }

    /** Sauvegarde, diffuse l'état sur le topic du workspace, et rend le DTO. */
    private AnalysisJobResponse publish(AnalysisJob job) {
        AnalysisJobResponse response = toResponse(jobRepository.save(job));
        try {
            messagingTemplate.convertAndSend("/topic/analysis." + job.getWorkspace().getId(), response);
        } catch (Exception ex) {
            // Best-effort : le dock retombe sur son polling. Ne jamais faire échouer le workflow ici.
            log.warn("Publication temps réel du workflow {} échouée : {}", job.getId(), ex.getMessage());
        }
        return response;
    }

    private AnalysisJobResponse toResponse(AnalysisJob job) {
        return new AnalysisJobResponse(
            job.getId(),
            job.getProject().getId(),
            job.getProject().getName(),
            job.getDepth().name(),
            job.getStatus().name(),
            readPlan(job.getPlanJson()),
            job.getQuestion(),
            job.getError(),
            job.getBrief() != null ? job.getBrief().getId() : null,
            job.getCreatedAt(),
            job.getUpdatedAt()
        );
    }

    private StoredBriefResponse toResponse(DecisionBriefEntity brief) {
        List<String> risks = new ArrayList<>();
        readJson(brief.getRisksJson()).forEach(node -> risks.add(node.asText()));

        return new StoredBriefResponse(
            brief.getId(),
            brief.getProject().getId(),
            brief.getSituation(),
            risks,
            new Snapshot(
                brief.getSnapshotTotal(), brief.getSnapshotOpen(), brief.getSnapshotInProgress(),
                brief.getSnapshotCompleted(), brief.getSnapshotOverdue(), brief.getSnapshotDueSoon()),
            brief.getPriorities().stream().map(this::toResponse).toList(),
            brief.getMode(),
            brief.getCreatedAt()
        );
    }

    private StoredPriorityResponse toResponse(DecisionPriority p) {
        Issue issue = p.getIssue();
        return new StoredPriorityResponse(
            p.getId(),
            p.getLevel(),
            p.getTitle(),
            p.getRationale(),
            p.getStatus().name(),
            issue != null ? issue.getId() : null,
            issue != null ? issueIdentifier(issue) : null,
            p.getPosition()
        );
    }

    /** Identifiant lisible d'une issue (ex. {@code WEB-42}). */
    private String issueIdentifier(Issue issue) {
        Project project = issue.getProject();
        if (project == null || issue.getSequenceNumber() == null) return null;
        return project.getIdentifier() + "-" + issue.getSequenceNumber();
    }

    /** HIGH | MEDIUM | LOW → priorité d'issue, MEDIUM par défaut. */
    private IssuePriority issuePriority(String level) {
        try {
            return IssuePriority.valueOf(level);
        } catch (IllegalArgumentException ex) {
            return IssuePriority.MEDIUM;
        }
    }

    private JsonNode readJson(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (Exception ex) {
            return objectMapper.createArrayNode();
        }
    }

    /**
     * Relit le plan en structures neutres (listes/maps du JDK) plutôt qu'en {@code JsonNode} :
     * cf. {@link AnalysisJobResponse} — le sérialiseur HTTP (Jackson 3) ne connaît pas les nœuds
     * Jackson 2 et les rendrait comme des POJO.
     */
    private List<Map<String, Object>> readPlan(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception ex) {
            log.warn("Plan illisible, workflow rendu sans étapes : {}", ex.getMessage());
            return List.of();
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "[]";
        }
    }

    private String truncate(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max);
    }
}
