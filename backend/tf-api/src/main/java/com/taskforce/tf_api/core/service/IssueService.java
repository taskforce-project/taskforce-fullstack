package com.taskforce.tf_api.core.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueRelationRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueStatusRequest;
import com.taskforce.tf_api.core.dto.request.ReorderStatusesRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueStatusRequest;
import com.taskforce.tf_api.core.dto.response.IssueActivityResponse;
import com.taskforce.tf_api.core.dto.response.IssueCommentResponse;
import com.taskforce.tf_api.core.dto.response.IssueRelationResponse;
import com.taskforce.tf_api.core.dto.request.CreateChecklistItemRequest;
import com.taskforce.tf_api.core.dto.request.LogWorkRequest;
import com.taskforce.tf_api.core.dto.response.WorklogResponse;
import com.taskforce.tf_api.core.model.IssueWorklog;
import com.taskforce.tf_api.core.repository.IssueWorklogRepository;
import com.taskforce.tf_api.core.dto.request.UpdateChecklistItemRequest;
import com.taskforce.tf_api.core.dto.response.ChecklistItemResponse;
import com.taskforce.tf_api.core.dto.response.IssueRealtimeEvent;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.model.IssueChecklistItem;
import com.taskforce.tf_api.core.repository.IssueChecklistItemRepository;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.IssueTypeResponse;
import com.taskforce.tf_api.core.dto.response.IssueSummaryResponse;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.UserSummaryResponse;
import com.taskforce.tf_api.core.enums.IssueActivityType;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueRelationType;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.enums.PlanFeature;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueActivity;
import com.taskforce.tf_api.core.model.IssueComment;
import com.taskforce.tf_api.core.model.IssueRelation;
import com.taskforce.tf_api.core.model.IssueSequenceCounter;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.IssueType;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectLabel;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueActivityRepository;
import com.taskforce.tf_api.core.repository.IssueCommentRepository;
import com.taskforce.tf_api.core.repository.IssueRelationRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueSequenceCounterRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;
import com.taskforce.tf_api.core.repository.IssueTypeRepository;
import com.taskforce.tf_api.core.repository.ProjectLabelRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.dto.PageResponse;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.extern.slf4j.Slf4j;

/**
 * Service de gestion des issues.
 * Toutes les opérations sont scopées par workspace + projet.
 */
@Service
@Slf4j
public class IssueService {

    private final IssueRepository               issueRepository;
    private final IssueStatusRepository         issueStatusRepository;
    private final IssueTypeRepository           issueTypeRepository;
    private final IssueSequenceCounterRepository sequenceCounterRepository;
    private final IssueCommentRepository        commentRepository;
    private final IssueActivityRepository       activityRepository;
    private final IssueRelationRepository       relationRepository;
    private final ProjectRepository             projectRepository;
    private final WorkspaceRepository           workspaceRepository;
    private final WorkspaceMemberRepository     workspaceMemberRepository;
    private final UserRepository                userRepository;
    private final NotificationService           notificationService;
    private final ProjectLabelRepository        projectLabelRepository;
    private final SimpMessagingTemplate         messagingTemplate;
    private final IssueChecklistItemRepository  checklistRepository;
    private final IssueWorklogRepository        worklogRepository;
    private final SlackIntegrationService       slackService;
    private final ProjectVisibilityGuard        visibilityGuard;
    private final PlanFeatureService            planFeatureService;

    /** Plafond d'issues du forfait Free (par workspace). Payant = illimité. */
    private static final long FREE_ISSUE_LIMIT = 250;

    /** Rétention d'historique d'activité sans {@code UNLIMITED_HISTORY} : N dernières entrées (payant = illimité). */
    @Value("${issue.history.retention-limit:100}")
    private int historyRetentionLimit;

    public IssueService(
        IssueRepository issueRepository,
        IssueStatusRepository issueStatusRepository,
        IssueTypeRepository issueTypeRepository,
        IssueSequenceCounterRepository sequenceCounterRepository,
        IssueCommentRepository commentRepository,
        IssueActivityRepository activityRepository,
        IssueRelationRepository relationRepository,
        ProjectRepository projectRepository,
        WorkspaceRepository workspaceRepository,
        WorkspaceMemberRepository workspaceMemberRepository,
        UserRepository userRepository,
        @org.springframework.context.annotation.Lazy NotificationService notificationService,
        ProjectLabelRepository projectLabelRepository,
        SimpMessagingTemplate messagingTemplate,
        IssueChecklistItemRepository checklistRepository,
        IssueWorklogRepository worklogRepository,
        SlackIntegrationService slackService,
        ProjectVisibilityGuard visibilityGuard,
        PlanFeatureService planFeatureService
    ) {
        this.issueRepository = issueRepository;
        this.issueStatusRepository = issueStatusRepository;
        this.issueTypeRepository = issueTypeRepository;
        this.sequenceCounterRepository = sequenceCounterRepository;
        this.commentRepository = commentRepository;
        this.activityRepository = activityRepository;
        this.relationRepository = relationRepository;
        this.projectRepository = projectRepository;
        this.workspaceRepository = workspaceRepository;
        this.workspaceMemberRepository = workspaceMemberRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.projectLabelRepository = projectLabelRepository;
        this.messagingTemplate = messagingTemplate;
        this.checklistRepository = checklistRepository;
        this.worklogRepository = worklogRepository;
        this.slackService = slackService;
        this.visibilityGuard = visibilityGuard;
        this.planFeatureService = planFeatureService;
    }

    // =========================================================================
    // Seeding par défaut (appelé à la création d'un projet)
    // =========================================================================

    /**
     * Insère les statuts et types d'issues par défaut pour un nouveau projet.
     * Appelé dans ProjectService.createProject().
     */
    @Transactional
    public void seedDefaultStatusesAndTypes(Project project) {
        // --- Statuts ---
        issueStatusRepository.save(buildStatus(project, "Backlog",     "#94a3b8", IssueStatusCategory.BACKLOG,    (short) 0, false));
        issueStatusRepository.save(buildStatus(project, "Todo",        "#6366f1", IssueStatusCategory.UNSTARTED,  (short) 1, true));
        issueStatusRepository.save(buildStatus(project, "In Progress", "#f59e0b", IssueStatusCategory.STARTED,    (short) 2, false));
        issueStatusRepository.save(buildStatus(project, "Done",        "#10b981", IssueStatusCategory.COMPLETED,  (short) 3, false));
        issueStatusRepository.save(buildStatus(project, "Cancelled",   "#ef4444", IssueStatusCategory.CANCELLED,  (short) 4, false));

        // --- Types ---
        issueTypeRepository.save(buildType(project, "Task",    "#6366f1", "circle-dot", true));
        issueTypeRepository.save(buildType(project, "Bug",     "#ef4444", "bug",        false));
        issueTypeRepository.save(buildType(project, "Feature", "#10b981", "zap",        false));

        // --- Compteur séquence (uniquement si absent) ---
        boolean counterExists = sequenceCounterRepository.findByProjectIdForUpdate(project.getId()).isPresent();
        if (!counterExists) {
            IssueSequenceCounter counter = IssueSequenceCounter.builder()
                .project(project)
                .lastNumber(0)
                .build();
            sequenceCounterRepository.save(counter);
        }

        log.info("Statuts, types et compteur d'issues initialisés pour le projet '{}'", project.getIdentifier());
    }

    private IssueStatus buildStatus(Project project, String name, String color,
                                    IssueStatusCategory category, short position, boolean isDefault) {
        return IssueStatus.builder()
            .project(project)
            .name(name)
            .color(color)
            .category(category)
            .position(position)
            .isDefault(isDefault)
            .build();
    }

    private IssueType buildType(Project project, String name, String color, String icon, boolean isDefault) {
        return IssueType.builder()
            .project(project)
            .name(name)
            .color(color)
            .icon(icon)
            .isDefault(isDefault)
            .build();
    }

    // =========================================================================
    // Issues — CRUD
    // =========================================================================

    /**
     * Liste toutes les issues d'un projet (premier niveau uniquement).
     */
    @Transactional(readOnly = true)
    public List<IssueResponse> listIssues(String workspaceSlug, Long projectId, Long requestingUserId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), requestingUserId);
        visibilityGuard.assertCanView(project, requestingUserId); // projet privé : membres invités + OWNER/ADMIN
        return issueRepository.findForKanban(project.getId()).stream()
            .map(this::toResponse)
            .toList();
    }

    /**
     * Liste paginée des issues d'un projet (QA2-33) — triée par sequenceNumber desc.
     * Additif : ne remplace pas {@link #listIssues} (utilisé par le board/kanban qui charge tout).
     */
    @Transactional(readOnly = true)
    public PageResponse<IssueResponse> listIssuesPaged(String workspaceSlug, Long projectId,
                                                       Long requestingUserId,
                                                       org.springframework.data.domain.Pageable pageable) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), requestingUserId);
        visibilityGuard.assertCanView(project, requestingUserId); // projet privé : membres invités + OWNER/ADMIN
        return PageResponse.of(
            issueRepository.findByProjectIdOrderBySequenceNumberDesc(project.getId(), pageable)
                .map(this::toResponse)
        );
    }

    /**
     * Retourne toutes les issues planifiées (startDate ou dueDate renseigné) du workspace — utilisé par la roadmap.
     */
    @Transactional(readOnly = true)
    public List<IssueResponse> getScheduledIssues(String slug, Long userId) {
        var ws = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        assertWorkspaceMember(ws.getId(), userId);
        // Visibilité projet privé : on ne renvoie que les issues des projets visibles par l'utilisateur.
        boolean admin = visibilityGuard.isWorkspaceAdmin(ws.getId(), userId);
        Set<Long> memberProjectIds = admin ? Set.of() : visibilityGuard.memberProjectIds(userId);
        return issueRepository.findScheduledByWorkspaceSlug(slug).stream()
            .filter(i -> admin || i.getProject().isPublic() || memberProjectIds.contains(i.getProject().getId()))
            .map(this::toResponse)
            .toList();
    }

    /**
     * Retourne toutes les issues assignées à l'utilisateur courant sur l'ensemble du workspace (vue My Work).
     */
    @Transactional(readOnly = true)
    public List<IssueResponse> listMyIssues(String slug, Long userId) {
        var ws = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        assertWorkspaceMember(ws.getId(), userId);
        // Pas de filtre de visibilité : une issue ASSIGNÉE à l'utilisateur implique qu'il y a accès
        // (on ne lui cache pas son propre travail, même sur un projet privé).
        return issueRepository.findByWorkspaceSlugAndAssigneeId(slug, userId).stream()
            .map(this::toResponse)
            .toList();
    }

    /**
     * Récupère une issue par son identifiant.
     */
    @Transactional(readOnly = true)
    public IssueResponse getIssue(String workspaceSlug, Long projectId, Long issueId, Long requestingUserId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), requestingUserId);
        visibilityGuard.assertCanView(project, requestingUserId); // projet privé : membres invités + OWNER/ADMIN
        Issue issue = resolveIssue(issueId, project.getId());
        return toResponse(issue);
    }

    /**
     * Crée une nouvelle issue dans le projet.
     */
    @Transactional
    public IssueResponse createIssue(String workspaceSlug, Long projectId,
                                     CreateIssueRequest request, Long reporterId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, reporterId);
        enforceIssueLimit(project); // plafond 250 issues sur le forfait Free

        User reporter = resolveUser(reporterId);

        // Statut
        IssueStatus status;
        if (request.getStatusId() != null) {
            status = issueStatusRepository.findById(request.getStatusId())
                .filter(s -> s.getProject().getId().equals(project.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Statut introuvable"));
        } else {
            status = issueStatusRepository.findByProjectIdAndIsDefaultTrue(project.getId())
                .orElseThrow(() -> new BusinessException("Aucun statut par défaut configuré pour ce projet"));
        }

        // Type
        IssueType type = null;
        if (request.getTypeId() != null) {
            type = issueTypeRepository.findById(request.getTypeId())
                .filter(t -> t.getProject().getId().equals(project.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Type introuvable"));
        }

        // Assignee
        User assignee = null;
        if (request.getAssigneeId() != null) {
            assignee = resolveUser(request.getAssigneeId());
        }

        // Parent
        Issue parent = null;
        if (request.getParentId() != null) {
            parent = resolveIssue(request.getParentId(), project.getId());
        }

        // Numéro de séquence atomique
        int seqNumber = incrementAndGetSequence(project.getId());

        // Position dans la colonne = nombre d'issues déjà dans ce statut
        int issuePosition = (int) issueRepository.countByProjectIdAndStatusId(project.getId(), status.getId());

        Issue issue = Issue.builder()
            .project(project)
            .sequenceNumber(seqNumber)
            .title(request.getTitle())
            .description(request.getDescription())
            .priority(request.getPriority() != null ? request.getPriority() : IssuePriority.NONE)
            .status(status)
            .type(type)
            .assignee(assignee)
            .reporter(reporter)
            .parent(parent)
            .position(issuePosition)
            .startDate(request.getStartDate() != null ? LocalDate.parse(request.getStartDate()) : null)
            .dueDate(request.getDueDate() != null ? LocalDate.parse(request.getDueDate()) : null)
            .build();

        issue = issueRepository.save(issue);
        logActivity(issue, reporter, IssueActivityType.CREATED, null, issue.getTitle());

        // Notification d'assignation à la création
        if (assignee != null) {
            notificationService.notifyAssigned(issue, reporter);
        }

        IssueResponse created = toResponse(issue);
        publishIssueEvent("created", issue.getProject().getId(), issue.getId(), created);

        // Push Slack (best-effort, async) vers les canaux abonnés à "issue.created"
        slackService.notifyEvent(
            project.getWorkspace().getId(),
            "issue.created",
            "🆕 Nouvelle issue *" + project.getIdentifier() + "-" + issue.getSequenceNumber() + "* : " + issue.getTitle()
        );

        return created;
    }

    /**
     * Met à jour une issue (patch partiel).
     */
    @Transactional
    public IssueResponse updateIssue(String workspaceSlug, Long projectId, Long issueId,
                                     UpdateIssueRequest request, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);

        Issue issue = resolveIssue(issueId, project.getId());
        User actor = resolveUser(userId);

        if (request.getTitle() != null && !request.getTitle().isBlank()) {
            String old = issue.getTitle();
            issue.setTitle(request.getTitle());
            if (!old.equals(issue.getTitle())) {
                logActivity(issue, actor, IssueActivityType.TITLE_CHANGED, old, issue.getTitle());
            }
        }
        if (request.getDescription() != null) {
            issue.setDescription(request.getDescription());
            logActivity(issue, actor, IssueActivityType.DESCRIPTION_CHANGED, null, null);
        }
        if (request.getPriority() != null && !request.getPriority().equals(issue.getPriority())) {
            String old = issue.getPriority().name();
            issue.setPriority(request.getPriority());
            logActivity(issue, actor, IssueActivityType.PRIORITY_CHANGED, old, request.getPriority().name());
        }
        if (request.getStatusId() != null) {
            IssueStatus newStatus = issueStatusRepository.findById(request.getStatusId())
                .filter(s -> s.getProject().getId().equals(project.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Statut introuvable"));
            if (!newStatus.getId().equals(issue.getStatus().getId())) {
                String old = issue.getStatus().getName();
                issue.setStatus(newStatus);
                if (newStatus.getCategory() == IssueStatusCategory.COMPLETED && issue.getCompletedAt() == null) {
                    issue.setCompletedAt(LocalDateTime.now());
                    logActivity(issue, actor, IssueActivityType.COMPLETED, null, newStatus.getName());
                } else if (newStatus.getCategory() != IssueStatusCategory.COMPLETED && issue.getCompletedAt() != null) {
                    issue.setCompletedAt(null);
                    logActivity(issue, actor, IssueActivityType.REOPENED, old, newStatus.getName());
                } else {
                    logActivity(issue, actor, IssueActivityType.STATUS_CHANGED, old, newStatus.getName());
                }
                notificationService.notifyStatusChanged(issue, actor, newStatus.getName());
            }
        }
        if (request.getTypeId() != null) {
            IssueType newType = issueTypeRepository.findById(request.getTypeId())
                .filter(t -> t.getProject().getId().equals(project.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Type introuvable"));
            String old = issue.getType() != null ? issue.getType().getName() : null;
            issue.setType(newType);
            logActivity(issue, actor, IssueActivityType.TYPE_CHANGED, old, newType.getName());
        }
        if (request.getAssigneeId() != null) {
            User newAssignee = resolveUser(request.getAssigneeId());
            String old = issue.getAssignee() != null ? issue.getAssignee().getEmail() : null;
            issue.setAssignee(newAssignee);
            logActivity(issue, actor, IssueActivityType.ASSIGNEE_CHANGED, old, newAssignee.getEmail());
            notificationService.notifyAssigned(issue, actor);
        }
        if (request.getParentId() != null) {
            Issue newParent = resolveIssue(request.getParentId(), project.getId());
            String old = issue.getParent() != null ? issue.getParent().getId().toString() : null;
            issue.setParent(newParent);
            logActivity(issue, actor, IssueActivityType.PARENT_CHANGED, old, newParent.getId().toString());
        }
        if (request.getStartDate() != null) {
            issue.setStartDate(LocalDate.parse(request.getStartDate()));
            logActivity(issue, actor, IssueActivityType.START_DATE_CHANGED, null, request.getStartDate());
        }
        if (request.getDueDate() != null) {
            issue.setDueDate(LocalDate.parse(request.getDueDate()));
            logActivity(issue, actor, IssueActivityType.DUE_DATE_CHANGED, null, request.getDueDate());
        }
        if (request.getPosition() != null) {
            issue.setPosition(request.getPosition());
        }
        if (request.getStoryPoints() != null) {
            // 0 = retirer l'estimation (null en base) ; >0 = valeur
            issue.setStoryPoints(request.getStoryPoints() == 0 ? null : request.getStoryPoints());
        }
        if (request.getLabelIds() != null) {
            List<ProjectLabel> newLabels = new ArrayList<>(projectLabelRepository.findAllById(request.getLabelIds()));
            Set<Long> oldIds = issue.getLabels().stream().map(ProjectLabel::getId).collect(Collectors.toSet());
            Set<Long> newIds = newLabels.stream().map(ProjectLabel::getId).collect(Collectors.toSet());
            for (ProjectLabel added : newLabels) {
                if (!oldIds.contains(added.getId())) {
                    logActivity(issue, actor, IssueActivityType.LABEL_ADDED, null, added.getName());
                }
            }
            for (ProjectLabel removed : issue.getLabels()) {
                if (!newIds.contains(removed.getId())) {
                    logActivity(issue, actor, IssueActivityType.LABEL_REMOVED, removed.getName(), null);
                }
            }
            // Muter la collection gérée par Hibernate (clear/addAll) au lieu de la
            // remplacer par une nouvelle liste : remplacer le PersistentBag déclenche
            // un DELETE+INSERT dont l'ordre de flush peut violer la PK composite de
            // issue_label_assignments (cause du 500 au changement de label).
            issue.getLabels().clear();
            issue.getLabels().addAll(newLabels);
        }

        issue = issueRepository.save(issue);
        IssueResponse updated = toResponse(issue);
        publishIssueEvent("updated", issue.getProject().getId(), issue.getId(), updated);
        slackService.notifyEvent(issue.getProject().getWorkspace().getId(), "issue.updated",
            "✏️ Issue *" + issue.getProject().getIdentifier() + "-" + issue.getSequenceNumber() + "* mise à jour : " + issue.getTitle());
        return updated;
    }

    /** Liste les sous-tâches (issues enfants) d'une issue. */
    @Transactional
    public List<IssueResponse> listChildren(String workspaceSlug, Long projectId, Long issueId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        resolveIssue(issueId, project.getId()); // valide l'appartenance au projet
        return issueRepository.findByParentIdOrderBySequenceNumberAsc(issueId).stream()
            .map(this::toResponse)
            .toList();
    }

    // =========================================================================
    // Checklist (PROD-2.3)
    // =========================================================================

    @Transactional
    public List<ChecklistItemResponse> listChecklist(String slug, Long projectId, Long issueId, Long userId) {
        resolveChecklistScope(slug, projectId, issueId, userId);
        return checklistRepository.findByIssueIdOrderByPositionAscIdAsc(issueId).stream()
            .map(ChecklistItemResponse::from)
            .toList();
    }

    @Transactional
    public ChecklistItemResponse addChecklistItem(String slug, Long projectId, Long issueId, Long userId,
                                                  CreateChecklistItemRequest request) {
        assertWritableChecklistScope(slug, projectId, issueId, userId);
        IssueChecklistItem item = IssueChecklistItem.builder()
            .issueId(issueId)
            .content(request.getContent().trim())
            .done(false)
            .position((int) checklistRepository.countByIssueId(issueId))
            .build();
        return ChecklistItemResponse.from(checklistRepository.save(item));
    }

    @Transactional
    public ChecklistItemResponse updateChecklistItem(String slug, Long projectId, Long issueId, Long itemId,
                                                     Long userId, UpdateChecklistItemRequest request) {
        assertWritableChecklistScope(slug, projectId, issueId, userId);
        IssueChecklistItem item = checklistRepository.findByIdAndIssueId(itemId, issueId)
            .orElseThrow(() -> new ResourceNotFoundException("Item de checklist introuvable"));
        if (request.getContent() != null && !request.getContent().isBlank()) {
            item.setContent(request.getContent().trim());
        }
        if (request.getDone() != null) {
            item.setDone(request.getDone());
        }
        if (request.getPosition() != null) {
            item.setPosition(request.getPosition());
        }
        return ChecklistItemResponse.from(checklistRepository.save(item));
    }

    @Transactional
    public void deleteChecklistItem(String slug, Long projectId, Long issueId, Long itemId, Long userId) {
        assertWritableChecklistScope(slug, projectId, issueId, userId);
        IssueChecklistItem item = checklistRepository.findByIdAndIssueId(itemId, issueId)
            .orElseThrow(() -> new ResourceNotFoundException("Item de checklist introuvable"));
        checklistRepository.delete(item);
    }

    /** Vérifie projet + appartenance workspace + issue, pour les opérations de checklist. */
    private void resolveChecklistScope(String slug, Long projectId, Long issueId, Long userId) {
        Project project = resolveProject(slug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        resolveIssue(issueId, project.getId());
    }

    // =========================================================================
    // Time tracking — worklogs (BE-ISS-012)
    // =========================================================================

    @Transactional(readOnly = true)
    public List<WorklogResponse> listWorklogs(String slug, Long projectId, Long issueId, Long userId) {
        resolveChecklistScope(slug, projectId, issueId, userId);
        return worklogRepository.findByIssueIdOrderByLoggedAtDescIdDesc(issueId).stream()
            .map(w -> WorklogResponse.from(w, toUserSummary(w.getUser())))
            .toList();
    }

    @Transactional
    public WorklogResponse addWorklog(String slug, Long projectId, Long issueId, Long userId, LogWorkRequest request) {
        assertWritableChecklistScope(slug, projectId, issueId, userId);
        User author = resolveUser(userId);
        LocalDate loggedAt = (request.getLoggedAt() != null && !request.getLoggedAt().isBlank())
            ? LocalDate.parse(request.getLoggedAt())
            : LocalDate.now();
        IssueWorklog worklog = IssueWorklog.builder()
            .issueId(issueId)
            .user(author)
            .minutes(request.getMinutes())
            .description(request.getDescription() != null && !request.getDescription().isBlank()
                ? request.getDescription().trim() : null)
            .loggedAt(loggedAt)
            .build();
        return WorklogResponse.from(worklogRepository.save(worklog), toUserSummary(author));
    }

    @Transactional
    public void deleteWorklog(String slug, Long projectId, Long issueId, Long worklogId, Long userId) {
        assertWritableChecklistScope(slug, projectId, issueId, userId);
        IssueWorklog worklog = worklogRepository.findByIdAndIssueId(worklogId, issueId)
            .orElseThrow(() -> new ResourceNotFoundException("Entrée de temps introuvable"));
        // Seul l'auteur de l'entrée peut la supprimer (cohérent avec les commentaires).
        if (!worklog.getUser().getId().equals(userId)) {
            throw new BusinessException("Vous ne pouvez supprimer que vos propres entrées de temps");
        }
        worklogRepository.delete(worklog);
    }

    /**
     * Supprime une issue.
     */
    @Transactional
    public void deleteIssue(String workspaceSlug, Long projectId, Long issueId, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);
        Issue issue = resolveIssue(issueId, project.getId());
        // Capture avant suppression pour la notif Slack
        String issueRef   = project.getIdentifier() + "-" + issue.getSequenceNumber();
        String issueTitle = issue.getTitle();
        Long   workspaceId = project.getWorkspace().getId();
        issueRepository.delete(issue);
        publishIssueEvent("deleted", project.getId(), issueId, null);
        slackService.notifyEvent(workspaceId, "issue.deleted", "🗑️ Issue *" + issueRef + "* supprimée : " + issueTitle);
        log.info("Issue {} supprimée du projet {}", issueId, projectId);
    }

    /** Archive ou désarchive une issue (masquée des vues par défaut quand archivée). */
    @Transactional
    public IssueResponse setArchived(String workspaceSlug, Long projectId, Long issueId, boolean archived, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);
        Issue issue = resolveIssue(issueId, project.getId());
        issue.setArchivedAt(archived ? java.time.LocalDateTime.now() : null);
        // Une issue archivée ne reste pas épinglée.
        if (archived) issue.setPinned(false);
        issue = issueRepository.save(issue);
        IssueResponse updated = toResponse(issue);
        publishIssueEvent("updated", project.getId(), issueId, updated);
        return updated;
    }

    /** Épingle / dépingle une issue (remontée en tête de board/liste). */
    @Transactional
    public IssueResponse setPinned(String workspaceSlug, Long projectId, Long issueId, boolean pinned, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);
        Issue issue = resolveIssue(issueId, project.getId());
        issue.setPinned(pinned);
        issue = issueRepository.save(issue);
        IssueResponse updated = toResponse(issue);
        publishIssueEvent("updated", project.getId(), issueId, updated);
        return updated;
    }

    /** Diffuse un événement issue en temps réel sur le topic projet (best-effort). */
    private void publishIssueEvent(String action, Long projectId, Long issueId, IssueResponse issue) {
        try {
            messagingTemplate.convertAndSend(
                "/topic/projects." + projectId,
                IssueRealtimeEvent.builder()
                    .action(action)
                    .projectId(projectId)
                    .issueId(issueId)
                    .issue(issue)
                    .build()
            );
        } catch (Exception ex) {
            log.warn("Publication temps réel issue échouée (projet {}): {}", projectId, ex.getMessage());
        }
    }

    // =========================================================================
    // Statuts
    // =========================================================================

    @Transactional
    public List<IssueStatusResponse> listStatuses(String workspaceSlug, Long projectId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        List<IssueStatus> statuses = issueStatusRepository.findByProjectIdOrderByPosition(project.getId());
        if (statuses.isEmpty()) {
            log.info("Aucun statut trouvé pour le projet {} — initialisation par défaut", projectId);
            seedDefaultStatusesAndTypes(project);
            statuses = issueStatusRepository.findByProjectIdOrderByPosition(project.getId());
        }
        return statuses.stream().map(this::toStatusResponse).toList();
    }

    @Transactional
    public IssueStatusResponse createStatus(String workspaceSlug, Long projectId,
                                            CreateIssueStatusRequest request, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);

        if (issueStatusRepository.existsByProjectIdAndName(project.getId(), request.getName())) {
            throw new BusinessException("Un statut '" + request.getName() + "' existe déjà dans ce projet");
        }

        IssueStatusCategory category = IssueStatusCategory.valueOf(request.getCategory().toUpperCase());
        short position = request.getPosition() != null ? request.getPosition()
            : (short) issueStatusRepository.findByProjectIdOrderByPosition(project.getId()).size();

        IssueStatus status = buildStatus(project, request.getName(), request.getColor(), category, position, false);
        return toStatusResponse(issueStatusRepository.save(status));
    }

    @Transactional
    public IssueStatusResponse updateStatus(String workspaceSlug, Long projectId, Long statusId,
                                            UpdateIssueStatusRequest request, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);

        IssueStatus status = issueStatusRepository.findById(statusId)
            .filter(s -> s.getProject().getId().equals(project.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Statut introuvable"));

        if (request.getName() != null) status.setName(request.getName());
        if (request.getColor() != null) status.setColor(request.getColor());
        if (request.getPosition() != null) status.setPosition(request.getPosition());
        if (request.getIsDefault() != null && Boolean.TRUE.equals(request.getIsDefault())) {
            // Retire l'ancien default
            issueStatusRepository.findByProjectIdAndIsDefaultTrue(project.getId())
                .ifPresent(prev -> { prev.setDefault(false); issueStatusRepository.save(prev); });
            status.setDefault(true);
        }
        return toStatusResponse(issueStatusRepository.save(status));
    }

    @Transactional
    public void deleteStatus(String workspaceSlug, Long projectId, Long statusId, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);
        IssueStatus status = issueStatusRepository.findById(statusId)
            .filter(s -> s.getProject().getId().equals(project.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Statut introuvable"));
        if (status.isDefault()) {
            throw new BusinessException("Impossible de supprimer le statut par défaut");
        }
        issueStatusRepository.delete(status);
    }

    /**
     * Réordonne les statuts d'un projet en une seule transaction.
     * Typiquement déclenché par un drag & drop de colonne kanban.
     */
    @Transactional
    public List<IssueStatusResponse> reorderStatuses(String workspaceSlug, Long projectId,
                                                      ReorderStatusesRequest request, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);

        for (ReorderStatusesRequest.StatusPosition sp : request.getStatuses()) {
            IssueStatus status = issueStatusRepository.findById(sp.getId())
                .filter(s -> s.getProject().getId().equals(project.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Statut introuvable : " + sp.getId()));
            status.setPosition(sp.getPosition());
            issueStatusRepository.save(status);
        }

        return issueStatusRepository.findByProjectIdOrderByPosition(project.getId()).stream()
            .map(this::toStatusResponse)
            .toList();
    }

    // =========================================================================
    // Types
    // =========================================================================

    @Transactional(readOnly = true)
    public List<IssueTypeResponse> listTypes(String workspaceSlug, Long projectId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        return issueTypeRepository.findByProjectIdOrderByName(project.getId()).stream()
            .map(this::toTypeResponse)
            .toList();
    }

    // =========================================================================
    // Commentaires
    // =========================================================================

    @Transactional(readOnly = true)
    public List<IssueCommentResponse> listComments(String workspaceSlug, Long projectId, Long issueId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        resolveIssue(issueId, project.getId());
        return commentRepository.findByIssueIdOrderByCreatedAtAsc(issueId).stream()
            .map(this::toCommentResponse)
            .toList();
    }

    @Transactional
    public IssueCommentResponse addComment(String workspaceSlug, Long projectId, Long issueId,
                                           CreateIssueCommentRequest request, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);
        Issue issue = resolveIssue(issueId, project.getId());
        User author = resolveUser(userId);

        IssueComment comment = IssueComment.builder()
            .issue(issue)
            .author(author)
            .content(request.getContent())
            .build();
        comment = commentRepository.save(comment);
        logActivity(issue, author, IssueActivityType.COMMENT_ADDED, null, null);
        notificationService.notifyCommented(issue, author, comment);
        slackService.notifyEvent(project.getWorkspace().getId(), "comment.created",
            "💬 Nouveau commentaire de " + author.getDisplayName() + " sur *" + project.getIdentifier() + "-" + issue.getSequenceNumber() + "*");

        // Mentions : @email ou @partie-locale-email, résolues contre les membres du workspace
        List<User> mentioned = resolveMentions(request.getContent(), project.getWorkspace().getId());
        if (!mentioned.isEmpty()) {
            notificationService.notifyMentions(issue, author, mentioned, request.getContent());
        }
        return toCommentResponse(comment);
    }

    /** Motif de mention : @ suivi d'un token email ou de sa partie locale (ex. @pierre.michel ou @a@b.com) */
    private static final Pattern MENTION_PATTERN = Pattern.compile("@([A-Za-z0-9._%+-]+(?:@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})?)");

    /** Résout les @mentions d'un texte contre les membres du workspace (par email complet ou partie locale). */
    private List<User> resolveMentions(String content, Long workspaceId) {
        if (content == null || content.indexOf('@') < 0) return List.of();
        Matcher matcher = MENTION_PATTERN.matcher(content);
        Set<String> tokens = new HashSet<>();
        while (matcher.find()) tokens.add(matcher.group(1).toLowerCase());
        if (tokens.isEmpty()) return List.of();

        List<User> result = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (WorkspaceMember wm : workspaceMemberRepository.findByWorkspaceId(workspaceId)) {
            User u = wm.getUser();
            if (u.getEmail() == null) continue;
            String email = u.getEmail().toLowerCase();
            String local = email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
            if ((tokens.contains(email) || tokens.contains(local)) && seen.add(u.getId())) {
                result.add(u);
            }
        }
        return result;
    }

    @Transactional
    public IssueCommentResponse updateComment(String workspaceSlug, Long projectId, Long issueId,
                                              Long commentId, CreateIssueCommentRequest request, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);
        resolveIssue(issueId, project.getId());

        IssueComment comment = commentRepository.findById(commentId)
            .filter(c -> c.getIssue().getId().equals(issueId))
            .orElseThrow(() -> new ResourceNotFoundException("Commentaire introuvable"));

        if (!comment.getAuthor().getId().equals(userId)) {
            throw new BusinessException("Vous ne pouvez modifier que vos propres commentaires");
        }
        comment.setContent(request.getContent());
        comment.setEdited(true);
        return toCommentResponse(commentRepository.save(comment));
    }

    @Transactional
    public void deleteComment(String workspaceSlug, Long projectId, Long issueId, Long commentId, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);
        Issue issue = resolveIssue(issueId, project.getId());

        IssueComment comment = commentRepository.findById(commentId)
            .filter(c -> c.getIssue().getId().equals(issueId))
            .orElseThrow(() -> new ResourceNotFoundException("Commentaire introuvable"));
        if (!comment.getAuthor().getId().equals(userId)) {
            throw new BusinessException("Vous ne pouvez supprimer que vos propres commentaires");
        }
        commentRepository.delete(comment);
        logActivity(issue, resolveUser(userId), IssueActivityType.COMMENT_DELETED, null, null);
    }

    // =========================================================================
    // Activité
    // =========================================================================

    @Transactional(readOnly = true)
    public List<IssueActivityResponse> listActivity(String workspaceSlug, Long projectId, Long issueId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        resolveIssue(issueId, project.getId());
        List<IssueActivity> activities = activityRepository.findByIssueIdOrderByCreatedAtAsc(issueId);
        // Rétention d'historique par plan : UNLIMITED_HISTORY (BUSINESS+) = tout ; sinon on ne renvoie que
        // les N entrées les plus récentes (le compte payant conserve l'historique complet).
        PlanType plan = workspaceRepository.findOwnerPlanBySlug(workspaceSlug).orElse(PlanType.FREE);
        if (!planFeatureService.has(plan, PlanFeature.UNLIMITED_HISTORY) && activities.size() > historyRetentionLimit) {
            activities = activities.subList(activities.size() - historyRetentionLimit, activities.size());
        }
        return activities.stream().map(this::toActivityResponse).toList();
    }

    // =========================================================================
    // Relations
    // =========================================================================

    @Transactional(readOnly = true)
    public List<IssueRelationResponse> listRelations(String workspaceSlug, Long projectId, Long issueId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        Issue issue = resolveIssue(issueId, project.getId());
        return relationRepository.findByIssueId(issue.getId()).stream()
            .map(r -> toRelationResponse(r, issue.getId()))
            .toList();
    }

    @Transactional
    public IssueRelationResponse addRelation(String workspaceSlug, Long projectId, Long issueId,
                                              CreateIssueRelationRequest request, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);
        Issue source = resolveIssue(issueId, project.getId());
        Issue target = resolveIssue(request.getTargetIssueId(), project.getId());

        IssueRelationType type;
        try {
            type = IssueRelationType.valueOf(request.getRelationType());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("Type de relation invalide : " + request.getRelationType());
        }

        if (relationRepository.existsBySourceIdAndTargetIdAndRelationType(source.getId(), target.getId(), type)) {
            throw new BusinessException("Cette relation existe déjà");
        }

        User actor = resolveUser(userId);
        IssueRelation relation = IssueRelation.builder()
            .source(source)
            .target(target)
            .relationType(type)
            .createdBy(actor)
            .build();
        relation = relationRepository.save(relation);
        return toRelationResponse(relation, source.getId());
    }

    @Transactional
    public void deleteRelation(String workspaceSlug, Long projectId, Long issueId, Long relationId, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);
        IssueRelation relation = relationRepository.findById(relationId)
            .filter(r -> r.getSource().getId().equals(issueId) || r.getTarget().getId().equals(issueId))
            .orElseThrow(() -> new ResourceNotFoundException("Relation introuvable"));
        relationRepository.delete(relation);
    }

    // =========================================================================
    // Helpers privés
    // =========================================================================

    private Project resolveProject(String workspaceSlug, Long projectId) {
        return workspaceRepository.findBySlug(workspaceSlug)
            .flatMap(ws -> projectRepository.findByIdAndWorkspaceId(projectId, ws.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));
    }

    private Issue resolveIssue(Long issueId, Long projectId) {
        return issueRepository.findById(issueId)
            .filter(i -> i.getProject().getId().equals(projectId))
            .orElseThrow(() -> new ResourceNotFoundException("Issue introuvable"));
    }

    private User resolveUser(Long userId) {
        return userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }

    private void assertWorkspaceMember(Long workspaceId, Long userId) {
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, userId)) {
            throw new BusinessException("Accès refusé");
        }
    }

    /**
     * Prologue commun à toutes les opérations d'<b>écriture</b> d'issue : résout le projet, vérifie
     * l'appartenance workspace, puis le <b>droit d'écriture</b> ({@code VIEWER} = lecture seule ; projet
     * privé invisible → 404). Source unique de la garde d'écriture (TF-RBAC-WRITE).
     */
    private Project resolveWritableProject(String workspaceSlug, Long projectId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        visibilityGuard.assertCanWrite(project, userId);
        return project;
    }

    /** Idem {@link #resolveChecklistScope} + <b>droit d'écriture</b> (VIEWER exclu ; privé invisible → 404). */
    private void assertWritableChecklistScope(String slug, Long projectId, Long issueId, Long userId) {
        Project project = resolveProject(slug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        visibilityGuard.assertCanWrite(project, userId);
        resolveIssue(issueId, project.getId());
    }

    /**
     * Plafond d'issues du forfait Free ({@value #FREE_ISSUE_LIMIT} par workspace) — payant = illimité.
     * Lève une {@link IllegalStateException} (→ 409) pour déclencher l'upsell.
     */
    private void enforceIssueLimit(Project project) {
        User owner = project.getWorkspace().getOwner();
        if (owner == null || owner.isPaid()) {
            return; // forfait payant = issues illimitées
        }
        long count = issueRepository.countByWorkspaceId(project.getWorkspace().getId());
        if (count >= FREE_ISSUE_LIMIT) {
            throw new IllegalStateException(
                "Limite de " + FREE_ISSUE_LIMIT + " issues atteinte sur le forfait Free. "
                + "Passez à un forfait payant pour des issues illimitées.");
        }
    }

    @Transactional
    protected int incrementAndGetSequence(Long projectId) {
        IssueSequenceCounter counter = sequenceCounterRepository.findByProjectIdForUpdate(projectId)
            .orElseThrow(() -> new BusinessException("Compteur de séquence introuvable pour ce projet"));
        int next = counter.getLastNumber() + 1;
        counter.setLastNumber(next);
        sequenceCounterRepository.save(counter);
        return next;
    }

    private void logActivity(Issue issue, User actor, IssueActivityType action, String oldValue, String newValue) {
        IssueActivity activity = IssueActivity.builder()
            .issue(issue)
            .actor(actor)
            .action(action)
            .oldValue(oldValue)
            .newValue(newValue)
            .build();
        activityRepository.save(activity);
    }

    // =========================================================================
    // Mapping vers DTO
    // =========================================================================

    public IssueResponse toResponse(Issue issue) {
        return IssueResponse.builder()
            .id(issue.getId())
            .sequenceNumber(issue.getSequenceNumber())
            .identifier(issue.getProject().getIdentifier() + "-" + issue.getSequenceNumber())
            .projectId(issue.getProject().getId())
            .projectName(issue.getProject().getName())
            .title(issue.getTitle())
            .description(issue.getDescription())
            .priority(issue.getPriority())
            .status(toStatusResponse(issue.getStatus()))
            .type(issue.getType() != null ? toTypeResponse(issue.getType()) : null)
            .assignee(issue.getAssignee() != null ? toUserSummary(issue.getAssignee()) : null)
            .reporter(toUserSummary(issue.getReporter()))
            .parent(issue.getParent() != null ? toIssueSummary(issue.getParent()) : null)
            .childCount(issue.getChildren().size())
            .startDate(issue.getStartDate())
            .dueDate(issue.getDueDate())
            .completedAt(issue.getCompletedAt())
            .position(issue.getPosition())
            .storyPoints(issue.getStoryPoints())
            .labels(issue.getLabels().stream()
                .map(l -> ProjectLabelResponse.builder()
                    .id(l.getId())
                    .name(l.getName())
                    .color(l.getColor())
                    .build())
                .toList())
            .commentCount(issue.getComments().size())
            .archived(issue.getArchivedAt() != null)
            .pinned(Boolean.TRUE.equals(issue.getPinned()))
            .createdAt(issue.getCreatedAt())
            .updatedAt(issue.getUpdatedAt())
            .build();
    }

    private IssueSummaryResponse toIssueSummary(Issue issue) {
        return IssueSummaryResponse.builder()
            .id(issue.getId())
            .sequenceNumber(issue.getSequenceNumber())
            .identifier(issue.getProject().getIdentifier() + "-" + issue.getSequenceNumber())
            .title(issue.getTitle())
            .status(toStatusResponse(issue.getStatus()))
            .build();
    }

    public IssueStatusResponse toStatusResponse(IssueStatus s) {
        return IssueStatusResponse.builder()
            .id(s.getId())
            .name(s.getName())
            .color(s.getColor())
            .category(s.getCategory())
            .position(s.getPosition())
            .isDefault(s.isDefault())
            .build();
    }

    public IssueTypeResponse toTypeResponse(IssueType t) {
        return IssueTypeResponse.builder()
            .id(t.getId())
            .name(t.getName())
            .color(t.getColor())
            .icon(t.getIcon())
            .isDefault(t.isDefault())
            .build();
    }

    private IssueCommentResponse toCommentResponse(IssueComment c) {
        return IssueCommentResponse.builder()
            .id(c.getId())
            .author(toUserSummary(c.getAuthor()))
            .content(c.getContent())
            .isEdited(c.isEdited())
            .createdAt(c.getCreatedAt())
            .updatedAt(c.getUpdatedAt())
            .build();
    }

    private IssueActivityResponse toActivityResponse(IssueActivity a) {
        return IssueActivityResponse.builder()
            .id(a.getId())
            .actor(a.getActor() != null ? toUserSummary(a.getActor()) : null)
            .action(a.getAction())
            .oldValue(a.getOldValue())
            .newValue(a.getNewValue())
            .createdAt(a.getCreatedAt())
            .build();
    }

    private IssueRelationResponse toRelationResponse(IssueRelation r, Long perspectiveIssueId) {
        // "issue" = l'issue du point de vue de l'appelant, "relatedIssue" = l'autre
        boolean isSource = r.getSource().getId().equals(perspectiveIssueId);
        Issue self    = isSource ? r.getSource() : r.getTarget();
        Issue related = isSource ? r.getTarget() : r.getSource();
        return IssueRelationResponse.builder()
            .id(r.getId())
            .relationType(r.getRelationType())
            .issue(toIssueSummary(self))
            .relatedIssue(toIssueSummary(related))
            .createdBy(toUserSummary(r.getCreatedBy()))
            .createdAt(r.getCreatedAt())
            .build();
    }

    public UserSummaryResponse toUserSummaryPublic(User u) {
        return toUserSummary(u);
    }

    private UserSummaryResponse toUserSummary(User u) {
        return UserSummaryResponse.builder()
            .id(u.getId())
            .email(u.getEmail())
            .displayName(u.getDisplayName())
            .avatarUrl(u.getAvatarUrl())
            .build();
    }
}
