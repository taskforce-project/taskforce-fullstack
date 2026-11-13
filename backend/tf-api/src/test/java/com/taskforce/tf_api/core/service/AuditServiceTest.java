package com.taskforce.tf_api.core.service;

import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.model.AuditLog;
import com.taskforce.tf_api.core.repository.AuditLogRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Tests unitaires - {@link AuditService#recordAfterCommit} (revue de la PR #532) : une entrée qui décrit un changement
 * ne s'écrit qu'une fois la transaction de ce changement validée, jamais pour un changement annulé.
 */
@DisplayName("AuditService, après la validation")
class AuditServiceTest {

    private final AuditLogRepository repository = Mockito.mock(AuditLogRepository.class);
    private final PlatformTransactionManager transactions = Mockito.mock(PlatformTransactionManager.class);
    private final AuditService audit = new AuditService(repository, new ObjectMapper(), transactions);

    @BeforeEach
    void aTransactionIsRunning() {
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void clear() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    @DisplayName("l'entrée attend la validation de la transaction, puis s'écrit, avec son détail")
    void theEntryWaitsForTheCommit() {
        audit.recordAfterCommit(1L, 7L, AuditService.COMPANY_APP_CHANGED, "connector_app", "slack-mcp",
            Map.of("change", "saved"));

        verify(repository, never()).save(any());
        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);

        ArgumentCaptor<AuditLog> entry = ArgumentCaptor.forClass(AuditLog.class);
        verify(repository).save(entry.capture());
        assertThat(entry.getValue().getAction()).isEqualTo(AuditService.COMPANY_APP_CHANGED);
        assertThat(entry.getValue().getEntityId()).isEqualTo("slack-mcp");
        assertThat(entry.getValue().getDetails()).contains("\"change\":\"saved\"");
    }

    @Test
    @DisplayName("un changement annulé ne laisse aucune entrée")
    void aRolledBackChangeLeavesNoEntry() {
        audit.recordAfterCommit(1L, 7L, AuditService.STORAGE_TARGET_CHANGED, "storage_target", null,
            Map.of("change", "chosen"));

        TransactionSynchronizationManager.getSynchronizations()
            .forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("sans transaction en cours, l'entrée s'écrit tout de suite")
    void withoutATransactionTheEntryIsWrittenAtOnce() {
        TransactionSynchronizationManager.clearSynchronization();

        audit.recordAfterCommit(1L, 7L, AuditService.SHARED_CONNECTION_CHANGED, "connector_connection", "linear",
            Map.of("change", "connected"));

        verify(repository).save(any());
    }
}
