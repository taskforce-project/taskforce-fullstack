package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.ModelCapabilityRun;

@Repository
public interface ModelCapabilityRunRepository extends JpaRepository<ModelCapabilityRun, Long> {

    /** Les dernières mesures d'une version de la suite, pour toute l'instance : la table s'en tire. */
    List<ModelCapabilityRun> findTop500BySuiteVersionOrderByStartedAtDesc(int suiteVersion);

    Optional<ModelCapabilityRun> findByIdAndWorkspaceId(Long id, Long workspaceId);
}
