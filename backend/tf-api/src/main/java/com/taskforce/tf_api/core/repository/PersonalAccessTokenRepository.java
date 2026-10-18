package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.PersonalAccessToken;

@Repository
public interface PersonalAccessTokenRepository extends JpaRepository<PersonalAccessToken, Long> {

    /** Jeton par empreinte, avec sa personne (lue à chaque requête authentifiée par ce jeton). */
    @Query("SELECT t FROM PersonalAccessToken t JOIN FETCH t.user WHERE t.tokenHash = :hash")
    Optional<PersonalAccessToken> findByTokenHashWithUser(@Param("hash") String hash);

    /** Jetons non révoqués d'une personne, les plus récents d'abord (expirés compris, pour qu'elle les retire). */
    List<PersonalAccessToken> findByUserIdAndRevokedAtIsNullOrderByCreatedAtDesc(Long userId);

    long countByUserIdAndRevokedAtIsNull(Long userId);

    Optional<PersonalAccessToken> findByIdAndUserIdAndRevokedAtIsNull(Long id, Long userId);

    /** Dernier usage, sans passer par l'entité (une écriture courte, pas de verrou sur la personne). */
    @Modifying
    @Query("UPDATE PersonalAccessToken t SET t.lastUsedAt = :now WHERE t.id = :id")
    int touch(@Param("id") Long id, @Param("now") LocalDateTime now);
}
