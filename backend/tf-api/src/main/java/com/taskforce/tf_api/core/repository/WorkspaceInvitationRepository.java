package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.InvitationStatus;
import com.taskforce.tf_api.core.model.WorkspaceInvitation;

@Repository
public interface WorkspaceInvitationRepository extends JpaRepository<WorkspaceInvitation, Long> {

    Optional<WorkspaceInvitation> findByToken(String token);

    List<WorkspaceInvitation> findByWorkspaceIdAndStatus(Long workspaceId, InvitationStatus status);

    List<WorkspaceInvitation> findByEmailIgnoreCaseAndStatus(String email, InvitationStatus status);

    Optional<WorkspaceInvitation> findByWorkspaceIdAndEmailIgnoreCaseAndStatus(
        Long workspaceId, String email, InvitationStatus status);
}
