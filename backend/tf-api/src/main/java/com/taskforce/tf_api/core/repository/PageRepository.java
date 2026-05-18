package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.Page;

public interface PageRepository extends JpaRepository<Page, Long> {

    /** Toutes les pages d'un projet, triées par date de mise à jour décroissante */
    List<Page> findByProjectIdOrderByUpdatedAtDesc(Long projectId);

    /** Cherche une page par son id ET son projectId (sécurité de scope) */
    Optional<Page> findByIdAndProjectId(Long id, Long projectId);
}
