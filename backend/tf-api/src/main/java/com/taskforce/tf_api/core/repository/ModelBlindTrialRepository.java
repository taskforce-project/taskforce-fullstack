package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.ModelBlindTrial;

@Repository
public interface ModelBlindTrialRepository extends JpaRepository<ModelBlindTrial, Long> {

    /** Un essai de cette personne dans cet espace : les autres ne le voient pas. */
    Optional<ModelBlindTrial> findByIdAndWorkspaceIdAndUserId(Long id, Long workspaceId, Long userId);

    /** Ses derniers essais tranchés, les plus récents d'abord. */
    List<ModelBlindTrial> findTop30ByWorkspaceIdAndUserIdAndDecidedAtIsNotNullOrderByDecidedAtDesc(Long workspaceId, Long userId);
}
