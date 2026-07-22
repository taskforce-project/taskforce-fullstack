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

import com.taskforce.tf_api.core.enums.InvitationStatus;
import com.taskforce.tf_api.core.model.WorkspaceInvitation;

@Repository
public interface WorkspaceInvitationRepository extends JpaRepository<WorkspaceInvitation, Long> {

    Optional<WorkspaceInvitation> findByToken(String token);

    List<WorkspaceInvitation> findByWorkspaceIdAndStatus(Long workspaceId, InvitationStatus status);

    List<WorkspaceInvitation> findByEmailIgnoreCaseAndStatus(String email, InvitationStatus status);

    Optional<WorkspaceInvitation> findByWorkspaceIdAndEmailIgnoreCaseAndStatus(
        Long workspaceId, String email, InvitationStatus status);

    /**
     * Purge des invitations restées sans suite (RGPD art. 5.1.e — limitation de la conservation).
     *
     * <p>Une invitation porte l'<b>e-mail d'une personne qui n'est pas utilisatrice</b> : passée son
     * échéance, cette donnée n'a plus de finalité. Les invitations {@code ACCEPTED} sont exclues —
     * l'invité est devenu membre, la ligne appartient à l'historique du workspace et son e-mail est
     * de toute façon déjà connu par ailleurs.</p>
     *
     * <p>{@code @Transactional} est porté par la méthode plutôt que par l'appelant : le
     * {@code RetentionScheduler} peut ainsi enchaîner les purges sans qu'un échec sur l'une
     * n'annule les autres. Les appels déjà transactionnels rejoignent simplement la transaction
     * courante (propagation {@code REQUIRED}).</p>
     *
     * @param cutoff date d'expiration en deçà de laquelle l'invitation est purgée
     * @return nombre de lignes supprimées
     */
    @Modifying
    @Transactional
    @Query("DELETE FROM WorkspaceInvitation i WHERE i.status <> 'ACCEPTED' AND i.expiresAt < :cutoff")
    int deleteStaleInvitations(@Param("cutoff") LocalDateTime cutoff);
}
