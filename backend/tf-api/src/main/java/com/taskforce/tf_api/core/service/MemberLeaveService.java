package com.taskforce.tf_api.core.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateLeaveRequest;
import com.taskforce.tf_api.core.dto.response.MemberLeaveResponse;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.MemberLeave;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.MemberLeaveRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Gestion des indisponibilités des membres (table {@code member_leaves}) — US-006.
 *
 * <p>Autorisation au niveau service : le requérant doit être membre du workspace.
 * Un membre peut gérer SES propres congés ; un OWNER/ADMIN peut gérer ceux de n'importe qui.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MemberLeaveService {

    private final MemberLeaveRepository memberLeaveRepository;
    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;

    @Transactional(readOnly = true)
    public List<MemberLeaveResponse> listLeaves(String slug, Long targetUserId, Long requesterId) {
        Workspace workspace = resolveWorkspace(slug);
        requireMember(workspace.getId(), requesterId);
        requireTargetMember(workspace.getId(), targetUserId);

        return memberLeaveRepository
            .findByWorkspaceIdAndUserIdOrderByStartDateDesc(workspace.getId(), targetUserId)
            .stream()
            .map(MemberLeaveResponse::from)
            .toList();
    }

    @Transactional
    public MemberLeaveResponse createLeave(String slug, Long targetUserId, Long requesterId,
                                           CreateLeaveRequest request) {
        Workspace workspace = resolveWorkspace(slug);
        WorkspaceMember requester = requireMember(workspace.getId(), requesterId);
        requireTargetMember(workspace.getId(), targetUserId);
        assertCanManage(requester, requesterId, targetUserId);

        if (request.getEndDate().isBefore(request.getStartDate())) {
            throw new BusinessException("La date de fin doit être postérieure ou égale à la date de début");
        }

        MemberLeave leave = MemberLeave.builder()
            .workspaceId(workspace.getId())
            .userId(targetUserId)
            .type(request.getType())
            .startDate(request.getStartDate())
            .endDate(request.getEndDate())
            .note(request.getNote() == null || request.getNote().isBlank()
                ? null : request.getNote().strip())
            .build();

        return MemberLeaveResponse.from(memberLeaveRepository.save(leave));
    }

    @Transactional
    public void deleteLeave(String slug, Long targetUserId, Long leaveId, Long requesterId) {
        Workspace workspace = resolveWorkspace(slug);
        WorkspaceMember requester = requireMember(workspace.getId(), requesterId);
        assertCanManage(requester, requesterId, targetUserId);

        MemberLeave leave = memberLeaveRepository.findById(leaveId)
            .filter(l -> l.getWorkspaceId().equals(workspace.getId())
                && l.getUserId().equals(targetUserId))
            .orElseThrow(() -> new ResourceNotFoundException("Indisponibilité introuvable"));

        memberLeaveRepository.delete(leave);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private Workspace resolveWorkspace(String slug) {
        return workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
    }

    private WorkspaceMember requireMember(Long workspaceId, Long userId) {
        return workspaceMemberRepository.findByWorkspaceIdAndUserId(workspaceId, userId)
            .orElseThrow(() -> new ForbiddenException("Accès refusé au workspace"));
    }

    private void requireTargetMember(Long workspaceId, Long userId) {
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, userId)) {
            throw new ResourceNotFoundException("Membre introuvable dans ce workspace");
        }
    }

    private void assertCanManage(WorkspaceMember requester, Long requesterId, Long targetUserId) {
        boolean isSelf = requesterId.equals(targetUserId);
        boolean isManager = requester.getRole() == WorkspaceRole.OWNER
            || requester.getRole() == WorkspaceRole.ADMIN;
        if (!isSelf && !isManager) {
            throw new ForbiddenException(
                "Seul le membre concerné ou un administrateur peut gérer ces indisponibilités");
        }
    }
}
