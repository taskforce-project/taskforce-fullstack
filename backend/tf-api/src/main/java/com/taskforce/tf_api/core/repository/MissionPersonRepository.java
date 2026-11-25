package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.model.MissionPerson;

/** L'identifiant opaque de chaque personne que les dossiers d'un espace nomment (R159, M6 ; second tour, L-a). */
@Repository
public interface MissionPersonRepository extends JpaRepository<MissionPerson, Long> {

    /** L'identifiant de cette personne dans cet espace, s'il a déjà été tiré. */
    Optional<MissionPerson> findByWorkspaceIdAndUserId(Long workspaceId, Long userId);

    /**
     * Écrit cet identifiant pour cette personne dans cet espace, sauf s'il en a déjà un : une autre transaction qui le tire
     * en même temps fait attendre celle-ci sur l'index unique, puis elle n'écrit rien, au lieu d'échouer (R159 de #551,
     * quatrième tour, d-b). Rend le nombre de lignes écrites ; l'appelant relit ensuite celle qui est restée.
     */
    @Transactional
    @Modifying
    @Query(value = "INSERT INTO mission_people (workspace_id, user_id, person, created_at) "
        + "VALUES (:workspaceId, :userId, :person, :createdAt) ON CONFLICT DO NOTHING", nativeQuery = true)
    int drawIfAbsent(@Param("workspaceId") Long workspaceId, @Param("userId") Long userId, @Param("person") String person,
                     @Param("createdAt") LocalDateTime createdAt);

    /** La personne qu'un identifiant de cet espace nomme, tant que son compte n'est pas purgé. */
    Optional<MissionPerson> findByWorkspaceIdAndPerson(Long workspaceId, String person);

    /** Ses identifiants dans tous les espaces : à oublier avec son compte. */
    List<MissionPerson> findByUserId(Long userId);
}
