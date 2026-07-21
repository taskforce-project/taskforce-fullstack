package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.ProjectStatus;
import com.taskforce.tf_api.core.model.Project;

@Repository
public interface ProjectRepository extends JpaRepository<Project, Long> {

    /** Tous les projets d'un workspace (tous statuts) */
    List<Project> findByWorkspaceIdOrderByCreatedAtDesc(Long workspaceId);

    /** Projets d'un workspace filtrés par statut */
    List<Project> findByWorkspaceIdAndStatusOrderByCreatedAtDesc(Long workspaceId, ProjectStatus status);

    /** Vérifier l'existence d'un identifiant dans un workspace */
    boolean existsByWorkspaceIdAndIdentifier(Long workspaceId, String identifier);

    /** Projets dont l'utilisateur est membre (via project_members) */
    @Query("""
        SELECT pm.project FROM ProjectMember pm
        WHERE pm.project.workspace.id = :workspaceId
          AND pm.user.id = :userId
        ORDER BY pm.project.createdAt DESC
        """)
    List<Project> findByWorkspaceIdAndMemberId(
        @Param("workspaceId") Long workspaceId,
        @Param("userId") Long userId
    );

    Optional<Project> findByIdAndWorkspaceId(Long id, Long workspaceId);

    /**
     * Historique quotidien de la santé des opérations : par jour, combien de projets étaient
     * « à risque » et « critiques ».
     *
     * <p><b>Reconstruction, pas journal.</b> Aucune table n'historise la santé d'un projet ; on la
     * recalcule à partir des seules dates portées par les issues. Une issue est comptée <i>ouverte</i>
     * au jour J si elle existait déjà ({@code created_at <= J}) et n'était pas encore terminée
     * ({@code completed_at} nul ou postérieur à J). Le ratio ouvertes/total place alors le projet
     * dans sa bande de santé, avec les mêmes seuils que l'affichage.</p>
     *
     * <p><b>Limite connue.</b> Une issue annulée sans {@code completed_at} reste comptée comme
     * ouverte dans l'historique, alors que le compteur du jour l'exclut (il lit le statut courant).
     * L'écart est borné au nombre d'issues dans ce cas — 1 sur 331 dans la base de démo, sans effet
     * sur les bandes. Le jour où l'annulation horodatera sa date, l'écart disparaîtra.</p>
     *
     * <p>Seuils alignés sur {@code deriveHealth} côté frontend (page Operations) : au-delà de 0,85
     * le projet est critique ; entre 0,55 et 0,85 il est à risque. Toute évolution doit rester
     * synchronisée des deux côtés.</p>
     *
     * @return lignes {@code [jour (java.sql.Date), atRisk (Number), critical (Number)]}, un point par jour
     */
    @Query(value = """
        WITH days AS (
            SELECT generate_series(CAST(:fromDate AS date), CURRENT_DATE, INTERVAL '1 day')::date AS d
        ),
        snapshot AS (
            SELECT days.d                                                        AS day,
                   p.id                                                          AS project_id,
                   COUNT(i.id) FILTER (WHERE i.created_at::date <= days.d)       AS total,
                   COUNT(i.id) FILTER (WHERE i.created_at::date <= days.d
                                         AND (i.completed_at IS NULL
                                              OR i.completed_at::date > days.d)) AS still_open
            FROM days
            CROSS JOIN projects p
            LEFT JOIN issues i ON i.project_id = p.id
            WHERE p.id IN (:projectIds)
            GROUP BY days.d, p.id
        )
        SELECT day,
               COUNT(*) FILTER (WHERE total > 0
                                  AND still_open::numeric / total >  0.55
                                  AND still_open::numeric / total <= 0.85) AS at_risk,
               COUNT(*) FILTER (WHERE total > 0
                                  AND still_open::numeric / total >  0.85) AS critical
        FROM snapshot
        GROUP BY day
        ORDER BY day
        """, nativeQuery = true)
    List<Object[]> findHealthHistory(
        @Param("projectIds") List<Long> projectIds,
        @Param("fromDate") java.time.LocalDate fromDate
    );

    /**
     * Activité quotidienne (issues créées) de PLUSIEURS projets en une requête.
     *
     * <p>Remplace un appel par projet côté page Operations. Seuls les jours porteurs d'au moins une
     * issue ressortent ; le service comble les trous pour rendre une série continue.</p>
     *
     * @return lignes {@code [projectId (Number), jour (java.sql.Date), count (Number)]}
     */
    @Query(value = """
        SELECT i.project_id, i.created_at::date AS day, COUNT(*) AS total
        FROM issues i
        WHERE i.project_id IN (:projectIds)
          AND i.created_at >= CAST(:fromDate AS date)
        GROUP BY i.project_id, i.created_at::date
        ORDER BY day
        """, nativeQuery = true)
    List<Object[]> findActivityByProjectIds(
        @Param("projectIds") List<Long> projectIds,
        @Param("fromDate") java.time.LocalDate fromDate
    );

    /** Compte les projets actifs d'un workspace */
    long countByWorkspaceIdAndStatus(Long workspaceId, ProjectStatus status);
}
