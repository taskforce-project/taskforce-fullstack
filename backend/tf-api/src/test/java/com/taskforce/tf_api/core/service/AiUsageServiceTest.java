package com.taskforce.tf_api.core.service;

import java.time.YearMonth;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.AiUsageResponse;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.AiTokenUsage;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.AiTokenUsageRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link AiUsageService}. Point clé : la conso est comptée <b>par compte</b>
 * (propriétaire), agrégée sur tous ses workspaces — pas par workspace (quota non contournable).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AiUsageService (conso par compte)")
class AiUsageServiceTest {

    @Mock private AiTokenUsageRepository repository;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private BrainAccessGuard access;

    @InjectMocks private AiUsageService service;

    private static final String PERIOD = YearMonth.now().toString();

    @Test
    @DisplayName("record : deux workspaces du même propriétaire → agrégés sur UNE ligne de compte")
    void record_aggregates_on_owner_account_across_workspaces() {
        // Workspaces 10 et 20 appartiennent au même compte 99.
        when(workspaceRepository.findOwnerIdByWorkspaceId(10L)).thenReturn(Optional.of(99L));
        when(workspaceRepository.findOwnerIdByWorkspaceId(20L)).thenReturn(Optional.of(99L));

        // Ligne d'agrégat du compte simulée en mémoire (upsert).
        final AiTokenUsage[] stored = { null };
        when(repository.findByAccountIdAndPeriod(99L, PERIOD))
            .thenAnswer(inv -> Optional.ofNullable(stored[0]));
        when(repository.save(any(AiTokenUsage.class)))
            .thenAnswer(inv -> { stored[0] = inv.getArgument(0); return stored[0]; });

        service.record(10L, new LlmUsage(100, 50, 150));
        service.record(20L, new LlmUsage(10, 5, 15)); // autre workspace, MÊME compte

        assertThat(stored[0].getAccountId()).isEqualTo(99L);
        assertThat(stored[0].getTotalTokens()).isEqualTo(165);      // 150 + 15 agrégés sur le compte
        assertThat(stored[0].getPromptTokens()).isEqualTo(110);
        assertThat(stored[0].getCompletionTokens()).isEqualTo(55);
        assertThat(stored[0].getRequestCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("record : propriétaire introuvable → no-op (rien enregistré)")
    void record_noop_when_owner_missing() {
        when(workspaceRepository.findOwnerIdByWorkspaceId(10L)).thenReturn(Optional.empty());
        service.record(10L, new LlmUsage(100, 50, 150));
        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("record : usage nul → no-op (ne résout même pas le compte)")
    void record_noop_when_usage_zero() {
        service.record(10L, LlmUsage.ZERO);
        verifyNoInteractions(workspaceRepository, repository);
    }

    @Test
    @DisplayName("getUsage : renvoie la conso agrégée du compte + le plafond du plan du propriétaire")
    void getUsage_returns_account_aggregate_and_owner_plan() {
        User owner = User.builder().id(99L).planType(PlanType.BUSINESS).build();
        Workspace ws = Workspace.builder().id(10L).slug("acme").owner(owner).build();
        when(access.resolveAndAuthorize("acme", 7L)).thenReturn(ws);

        AiTokenUsage row = new AiTokenUsage();
        row.setAccountId(99L);
        row.setPromptTokens(300);
        row.setCompletionTokens(200);
        row.setTotalTokens(500);
        row.setRequestCount(3);
        when(repository.findByAccountIdAndPeriod(eq(99L), anyString())).thenReturn(Optional.of(row));

        AiUsageResponse res = service.getUsage("acme", 7L);

        assertThat(res.plan()).isEqualTo("BUSINESS");
        assertThat(res.usedTokens()).isEqualTo(500);
        assertThat(res.limitTokens()).isEqualTo(2_000_000L); // plafond BUSINESS
        assertThat(res.requestCount()).isEqualTo(3);
    }
}
