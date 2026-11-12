package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.DeliveryRunApprovalSignature;

@Repository
public interface DeliveryRunApprovalSignatureRepository extends JpaRepository<DeliveryRunApprovalSignature, Long> {

    /** Les signatures d'un accord, dans l'ordre où elles sont venues. */
    List<DeliveryRunApprovalSignature> findByApprovalIdOrderBySignedAtAsc(Long approvalId);

    boolean existsByApprovalIdAndUserId(Long approvalId, Long userId);
}
