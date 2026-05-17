package com.taskforce.tf_api.core.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.AddIssueToCycleRequest;
import com.taskforce.tf_api.core.dto.request.CreateCycleRequest;
import com.taskforce.tf_api.core.dto.request.UpdateCycleRequest;
import com.taskforce.tf_api.core.dto.response.CycleResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.enums.CycleStatus;
import com.taskforce.tf_api.core.model.Cycle;
import com.taskforce.tf_api.core.model.CycleIssue;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.CycleIssueRepository;
import com.taskforce.tf_api.core.repository.CycleRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class CycleService {

    private final CycleRepository            cycleRepository;
    private final CycleIssueRepository       cycleIssueRepository;
    private final IssueRepository            issueRepository;
    private final ProjectRepository          projectRepository;
    private final WorkspaceRepository        workspaceRepository;
    private final WorkspaceMemberRepository  workspaceMemberRepository;
    private final UserRepository             userRepository;
    private final IssueService               issueService;

    // =========================================================================
    // CRUD cycles
    // =========================================================================

    @Transactional(readOnly = true)
    public List<CycleResponse> listCycles(String workspaceSlug, Long projectId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        return cycleRepository.findByProjectId(project.getId()).stream()
            .map(c -> toResponse(c, cycleIssueRepository.countByCycleId(c.getId())))
            .toList();
    }

    @Transactional
    public CycleResponse createCycle(String workspaceSlug, Long projectId,
                                      CreateCycleRequest request, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);

        if (cycleRepository.existsByNameAndProjectId(request.getName(), project.getId())) {
            throw new BusinessException("Un cycle avec ce nom existe déjà dans ce projet");
        }

        User actor = resolveUser(userId);
        Cycle cycle = Cycle.builder()
            .project(project)
            .name(request.getName())
            .description(request.getDescription())
            .startDate(request.getStartDate())
            .endDate(request.getEndDate())
            .status(CycleStatus.DRAFT)
            .createdBy(actor)
            .build();
        cycle = cycleRepository.save(cycle);
        return toResponse(cycle, 0L);
    }

    @Transactional(readOnly = true)
    public CycleResponse getCycle(String workspaceSlug, Long projectId, Long cycleId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        Cycle cycle = resolveCycle(cycleId, project.getId());
        return toResponse(cycle, cycleIssueRepository.countByCycleId(cycle.getId()));
    }

    @Transactional
    public CycleResponse updateCycle(String workspaceSlug, Long projectId, Long cycleId,
                                      UpdateCycleRequest request, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        Cycle cycle = resolveCycle(cycleId, project.getId());

        if (request.getName() != null) {
            if (!request.getName().equals(cycle.getName())
                    && cycleRepository.existsByNameAndProjectId(request.getName(), project.getId())) {
                throw new BusinessException("Un cycle avec ce nom existe déjà dans ce projet");
            }
            cycle.setName(request.getName());
        }
        if (request.getDescription() != null) cycle.setDescription(request.getDescription());
        if (request.getStartDate()   != null) cycle.setStartDate(request.getStartDate());
        if (request.getEndDate()     != null) cycle.setEndDate(request.getEndDate());
        if (request.getStatus()      != null) {
            try {
                cycle.setStatus(CycleStatus.valueOf(request.getStatus()));
            } catch (IllegalArgumentException e) {
                throw new BusinessException("Statut de cycle invalide : " + request.getStatus());
            }
        }

        cycle = cycleRepository.save(cycle);
        return toResponse(cycle, cycleIssueRepository.countByCycleId(cycle.getId()));
    }

    @Transactional
    public void deleteCycle(String workspaceSlug, Long projectId, Long cycleId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        Cycle cycle = resolveCycle(cycleId, project.getId());
        cycleRepository.delete(cycle);
    }

    // =========================================================================
    // Issues d'un cycle
    // =========================================================================

    @Transactional(readOnly = true)
    public List<IssueResponse> listCycleIssues(String workspaceSlug, Long projectId, Long cycleId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        resolveCycle(cycleId, project.getId());
        return cycleIssueRepository.findByCycleId(cycleId).stream()
            .map(ci -> issueService.toResponse(ci.getIssue()))
            .toList();
    }

    @Transactional
    public void addIssueToCycle(String workspaceSlug, Long projectId, Long cycleId,
                                 AddIssueToCycleRequest request, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        Cycle cycle = resolveCycle(cycleId, project.getId());

        Issue issue = issueRepository.findById(request.getIssueId())
            .filter(i -> i.getProject().getId().equals(project.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Issue introuvable dans ce projet"));

        if (cycleIssueRepository.existsByCycleIdAndIssueId(cycle.getId(), issue.getId())) {
            throw new BusinessException("Cette issue fait déjà partie du cycle");
        }

        User actor = resolveUser(userId);
        cycleIssueRepository.save(CycleIssue.builder()
            .cycle(cycle)
            .issue(issue)
            .addedBy(actor)
            .build());
    }

    @Transactional
    public void removeIssueFromCycle(String workspaceSlug, Long projectId, Long cycleId,
                                      Long issueId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        assertWorkspaceMember(project.getWorkspace().getId(), userId);
        resolveCycle(cycleId, project.getId());
        CycleIssue ci = cycleIssueRepository.findByCycleIdAndIssueId(cycleId, issueId)
            .orElseThrow(() -> new ResourceNotFoundException("Issue non trouvée dans ce cycle"));
        cycleIssueRepository.delete(ci);
    }

    // =========================================================================
    // Helpers privés
    // =========================================================================

    private Project resolveProject(String workspaceSlug, Long projectId) {
        return workspaceRepository.findBySlug(workspaceSlug)
            .flatMap(ws -> projectRepository.findByIdAndWorkspaceId(projectId, ws.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));
    }

    private Cycle resolveCycle(Long cycleId, Long projectId) {
        return cycleRepository.findByIdAndProjectId(cycleId, projectId)
            .orElseThrow(() -> new ResourceNotFoundException("Cycle introuvable"));
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

    private CycleResponse toResponse(Cycle c, long issueCount) {
        return CycleResponse.builder()
            .id(c.getId())
            .name(c.getName())
            .description(c.getDescription())
            .startDate(c.getStartDate())
            .endDate(c.getEndDate())
            .status(c.getStatus())
            .createdBy(issueService.toUserSummaryPublic(c.getCreatedBy()))
            .createdAt(c.getCreatedAt())
            .updatedAt(c.getUpdatedAt())
            .issueCount(issueCount)
            .build();
    }
}
