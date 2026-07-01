package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.model.AuditLog;
import com.taskforce.tf_api.core.repository.AuditLogRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Journal d'audit (RGPD C11.1 + sécurité C21). Enregistre les actions sensibles.
 *
 * <p>L'enregistrement est <b>best-effort</b> et en {@code REQUIRES_NEW} : un échec d'audit ne casse
 * jamais l'action métier, et l'entrée persiste même si la transaction métier est annulée (utile pour
 * auditer une tentative refusée).</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AuditService {

    // Actions auditées (constantes pour cohérence des filtres).
    public static final String USER_LOGIN        = "USER_LOGIN";
    public static final String ROLE_CHANGED      = "ROLE_CHANGED";
    public static final String MEMBER_REMOVED    = "MEMBER_REMOVED";
    public static final String WORKSPACE_DELETED = "WORKSPACE_DELETED";
    public static final String GDPR_EXPORT       = "GDPR_EXPORT";
    public static final String GDPR_DELETE       = "GDPR_DELETE";
    public static final String REDISTRIBUTION_APPLY = "REDISTRIBUTION_APPLY";

    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Long workspaceId, Long actorUserId, String action,
                       String entityType, String entityId, Map<String, Object> details) {
        try {
            AuditLog entry = AuditLog.builder()
                .workspaceId(workspaceId)
                .actorUserId(actorUserId)
                .action(action)
                .entityType(entityType)
                .entityId(entityId)
                .details(details != null ? toJson(details) : null)
                .build();
            auditLogRepository.save(entry);
        } catch (Exception ex) {
            log.warn("Échec d'écriture du journal d'audit (action={}): {}", action, ex.getMessage());
        }
    }

    /** Raccourci sans entité ni détails. */
    public void record(Long workspaceId, Long actorUserId, String action) {
        record(workspaceId, actorUserId, action, null, null, null);
    }

    @Transactional(readOnly = true)
    public List<AuditLog> listForWorkspace(Long workspaceId, int limit) {
        return auditLogRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId, PageRequest.of(0, limit));
    }

    private String toJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return null;
        }
    }
}
