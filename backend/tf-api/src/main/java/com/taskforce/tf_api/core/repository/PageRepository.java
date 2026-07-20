package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.model.Page;

public interface PageRepository extends JpaRepository<Page, Long> {

    /** Toutes les pages d'un projet, triées par date de mise à jour décroissante */
    List<Page> findByProjectIdOrderByUpdatedAtDesc(Long projectId);

    /**
     * Pages récentes d'un ensemble de projets, projet et auteur chargés en une passe.
     *
     * <p>Alimente la vue agrégée « Ma file ». Les {@code JOIN FETCH} évitent un SELECT par page
     * (nom du projet, auteur) ; le {@link Pageable} borne le volume — la vue n'affiche que les
     * documents récents, pas toute la base documentaire du workspace. La liste d'ids est déjà
     * filtrée sur les projets visibles par l'appelant.</p>
     */
    @Query("""
        SELECT p FROM Page p
        JOIN FETCH p.project pr
        LEFT JOIN FETCH p.createdBy
        WHERE pr.id IN :projectIds
        ORDER BY p.updatedAt DESC
        """)
    List<Page> findRecentByProjectIds(@Param("projectIds") List<Long> projectIds, Pageable pageable);

    /** Cherche une page par son id ET son projectId (sécurité de scope) */
    Optional<Page> findByIdAndProjectId(Long id, Long projectId);
}
