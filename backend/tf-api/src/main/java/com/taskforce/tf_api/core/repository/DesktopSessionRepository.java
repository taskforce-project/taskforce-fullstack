package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.DesktopSession;

@Repository
public interface DesktopSessionRepository extends JpaRepository<DesktopSession, Long> {

    /** Session par empreinte de jeton, avec sa personne (lue à chaque lancement de l'app). */
    @Query("SELECT s FROM DesktopSession s JOIN FETCH s.user WHERE s.tokenHash = :hash")
    Optional<DesktopSession> findByTokenHashWithUser(@Param("hash") String hash);

    /** Sessions non révoquées d'une personne, les plus récentes d'abord. */
    List<DesktopSession> findByUserIdAndRevokedAtIsNullOrderByCreatedAtDesc(Long userId);

    Optional<DesktopSession> findByIdAndUserIdAndRevokedAtIsNull(Long id, Long userId);
}
