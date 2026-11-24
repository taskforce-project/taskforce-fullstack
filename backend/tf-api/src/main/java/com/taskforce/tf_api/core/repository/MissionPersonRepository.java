package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.MissionPerson;

/** L'identifiant opaque de chaque personne que les dossiers d'un espace nomment (R159, M6 ; second tour, L-a). */
@Repository
public interface MissionPersonRepository extends JpaRepository<MissionPerson, Long> {

    /** L'identifiant de cette personne dans cet espace, s'il a déjà été tiré. */
    Optional<MissionPerson> findByWorkspaceIdAndUserId(Long workspaceId, Long userId);

    /** Ses identifiants dans tous les espaces : à oublier avec son compte. */
    List<MissionPerson> findByUserId(Long userId);
}
