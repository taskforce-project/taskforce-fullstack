package com.taskforce.tf_api.modules.sales.repository;

import com.taskforce.tf_api.modules.sales.domain.EnterpriseInquiry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository pour gérer les demandes ENTERPRISE.
 */
@Repository
public interface EnterpriseInquiryRepository extends JpaRepository<EnterpriseInquiry, UUID> {

    /**
     * Trouve toutes les demandes pour un email donné.
     */
    List<EnterpriseInquiry> findByEmailOrderByCreatedAtDesc(String email);

    /**
     * Vérifie si un email a déjà une demande en cours.
     */
    boolean existsByEmailAndStatusIn(String email, List<EnterpriseInquiry.InquiryStatus> statuses);

    /**
     * Trouve toutes les demandes avec un statut spécifique.
     */
    List<EnterpriseInquiry> findByStatusOrderByCreatedAtDesc(EnterpriseInquiry.InquiryStatus status);

    /**
     * Trouve la demande liée à un utilisateur.
     */
    Optional<EnterpriseInquiry> findByUserId(Long userId);
}
