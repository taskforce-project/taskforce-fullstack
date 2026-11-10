package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.ModelCapabilityRun;

@Repository
public interface ModelCapabilityRunRepository extends JpaRepository<ModelCapabilityRun, Long> {

    /** Les dernières mesures d'une version d'une suite, pour toute l'instance : la table des capacités s'en tire. */
    List<ModelCapabilityRun> findTop500BySuiteAndSuiteVersionOrderByStartedAtDesc(String suite, int suiteVersion);

    /** Les derniers passages d'une version d'une suite dans un espace : le banc des modèles (R131) s'en tire. */
    List<ModelCapabilityRun> findTop200ByWorkspaceIdAndSuiteAndSuiteVersionOrderByStartedAtDesc(Long workspaceId, String suite,
                                                                                               int suiteVersion);

    Optional<ModelCapabilityRun> findByIdAndWorkspaceId(Long id, Long workspaceId);
}
