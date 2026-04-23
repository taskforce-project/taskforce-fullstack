package com.taskforce.tf_api.core.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueStatusRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueStatusRequest;
import com.taskforce.tf_api.core.dto.response.IssueActivityResponse;
import com.taskforce.tf_api.core.dto.response.IssueCommentResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.IssueTypeResponse;
import com.taskforce.tf_api.core.dto.response.IssueSummaryResponse;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.UserSummaryResponse;
import com.taskforce.tf_api.core.enums.IssueActivityType;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueActivity;
import com.taskforce.tf_api.core.model.IssueComment;
import com.taskforce.tf_api.core.model.IssueSequenceCounter;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.IssueType;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.IssueActivityRepository;
import com.taskforce.tf_api.core.repository.IssueCommentRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueSequenceCounterRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;
import com.taskforce.tf_api.core.repository.IssueTypeRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
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
    private final ProjectRepository             projectRepository;
    private final WorkspaceRepository           workspaceRepository;
    private final WorkspaceMemberRepository     workspaceMemberRepository;
    private final UserRepository                userRepository;

    public IssueService(
        IssueRepository issueRepository,
        IssueStatusRepository issueStatusRepository,
        IssueTypeRepository issueTypeRepository,
        IssueSequenceCounterRepository sequenceCounterRepository,
        IssueCommentRepository commentRepository,
        IssueActivityRepository activityRepository,
        ProjectRepository projectRepository,
        WorkspaceRepository workspaceRepository,
        WorkspaceMemberRepository workspaceMemberRepository,
        UserRepository userRepository
    ) {
        this.issueRepository = issueRepository;
        this.issueStatusRepository = issueStatusRepository;
        this.issueTypeRepository = issueTypeRepository;
        this.sequenceCounterRepository = sequenceCounterRepository;
        this.commentRepository = commentRepository;
        this.activityRepository = activityRepository;
        this.projectRepository = projectRepository;
        this.workspaceRepository = workspaceRepository;
        this.workspaceMemberRepository = workspaceMemberRepository;
        this.userRepository = userRepository;
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
        return issueRepository.findForKanban(project.getId()).stream()
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
        Issue issue = resolveIssue(issueId, project.getId());
        return toResponse(issue);
    }

    /**
     * Crée une nouvelle issue dans le projet.
     */
    @Transactional
    public IssueResponse createIssue(String workspaceSlug, Long projectId,
                                     CreateIssueRequest request, Long reporterId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), reporterId);

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
            .startDate(request.getStartDate() != null ? LocalDate.parse(request.getStartDate()) : null)
            .dueDate(request.getDueDate() != null ? LocalDate.parse(request.getDueDate()) : null)
            .build();

        issue = issueRepository.save(issue);
        logActivity(issue, reporter, IssueActivityType.CREATED, null, issue.getTitle());

        return toResponse(issue);
    }

    /**
     * Met à jour une issue (patch partiel).
     */
    @Transactional
    public IssueResponse updateIssue(String workspaceSlug, Long projectId, Long issueId,
                                     UpdateIssueRequest request, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);

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

        issue = issueRepository.save(issue);
        return toResponse(issue);
    }

    /**
     * Supprime une issue.
     */
    @Transactional
    public void deleteIssue(String workspaceSlug, Long projectId, Long issueId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        Issue issue = resolveIssue(issueId, project.getId());
        issueRepository.delete(issue);
        log.info("Issue {} supprimée du projet {}", issueId, projectId);
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
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);

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
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);

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
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        IssueStatus status = issueStatusRepository.findById(statusId)
            .filter(s -> s.getProject().getId().equals(project.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Statut introuvable"));
        if (status.isDefault()) {
            throw new BusinessException("Impossible de supprimer le statut par défaut");
        }
        issueStatusRepository.delete(status);
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
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        Issue issue = resolveIssue(issueId, project.getId());
        User author = resolveUser(userId);

        IssueComment comment = IssueComment.builder()
            .issue(issue)
            .author(author)
            .content(request.getContent())
            .build();
        comment = commentRepository.save(comment);
        logActivity(issue, author, IssueActivityType.COMMENT_ADDED, null, null);
        return toCommentResponse(comment);
    }

    @Transactional
    public IssueCommentResponse updateComment(String workspaceSlug, Long projectId, Long issueId,
                                              Long commentId, CreateIssueCommentRequest request, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
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
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
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
        return activityRepository.findByIssueIdOrderByCreatedAtAsc(issueId).stream()
            .map(this::toActivityResponse)
            .toList();
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

    private IssueResponse toResponse(Issue issue) {
        return IssueResponse.builder()
            .id(issue.getId())
            .sequenceNumber(issue.getSequenceNumber())
            .identifier(issue.getProject().getIdentifier() + "-" + issue.getSequenceNumber())
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
            .labels(issue.getLabels().stream()
                .map(l -> ProjectLabelResponse.builder()
                    .id(l.getId())
                    .name(l.getName())
                    .color(l.getColor())
                    .build())
                .toList())
            .commentCount(issue.getComments().size())
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

    private UserSummaryResponse toUserSummary(User u) {
        return UserSummaryResponse.builder()
            .id(u.getId())
            .email(u.getEmail())
            .displayName(u.getDisplayName())
            .avatarUrl(u.getAvatarUrl())
            .build();
    }
}
