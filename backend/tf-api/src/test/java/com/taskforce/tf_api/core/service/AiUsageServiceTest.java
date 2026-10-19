package com.taskforce.tf_api.core.service;

import java.time.YearMonth;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.AiUsageResponse;
import com.taskforce.tf_api.core.model.AiTokenUsage;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.AiTokenUsageRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
    @Mock private AiRateGuard rateGuard;

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
    @DisplayName("getUsage : renvoie la conso agrégée du compte, illimitée par défaut (-1)")
    void getUsage_returns_account_aggregate_unlimited_by_default() {
        User owner = User.builder().id(99L).build();
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

        assertThat(res.usedTokens()).isEqualTo(500);
        assertThat(res.limitTokens()).isEqualTo(-1L); // aucun plafond tant que l'instance n'en pose pas
        assertThat(res.requestCount()).isEqualTo(3);
    }

    @Test
    @DisplayName("getUsage : expose le plafond posé par l'instance")
    void getUsage_exposes_instance_limit() {
        ReflectionTestUtils.setField(service, "monthlyTokenLimit", 1_000L);
        Workspace ws = Workspace.builder().id(10L).slug("acme").owner(User.builder().id(99L).build()).build();
        when(access.resolveAndAuthorize("acme", 7L)).thenReturn(ws);
        when(repository.findByAccountIdAndPeriod(eq(99L), anyString())).thenReturn(Optional.empty());

        assertThat(service.getUsage("acme", 7L).limitTokens()).isEqualTo(1_000L);
    }

    @ParameterizedTest(name = "plafond {0}, consommé {1} -> bloqué : {2}")
    @CsvSource({
        "0, 10000000, false",      // 0 = illimité (défaut) : jamais bloqué
        "50000, 50000, true",      // pile au plafond : bloqué (409)
        "800000, 500000, false"    // sous le plafond : OK
    })
    @DisplayName("assertWithinQuota : plafond d'instance, garde-débit toujours consulté")
    void assertWithinQuota_applies_instance_limit(long limit, long used, boolean blocked) {
        ReflectionTestUtils.setField(service, "monthlyTokenLimit", limit);
        when(workspaceRepository.findOwnerIdByWorkspaceId(10L)).thenReturn(Optional.of(99L));
        if (limit > 0) {
            AiTokenUsage row = new AiTokenUsage();
            row.setTotalTokens(used);
            when(repository.findByAccountIdAndPeriod(eq(99L), anyString())).thenReturn(Optional.of(row));
        }

        if (blocked) {
            assertThatThrownBy(() -> service.assertWithinQuota(10L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("monthly AI limit");
        } else {
            assertThatCode(() -> service.assertWithinQuota(10L)).doesNotThrowAnyException();
        }
        // Le garde-débit par minute est consulté sur le COMPTE (résolu depuis le workspace).
        verify(rateGuard).assertWithinRate(99L);
    }

    @Test
    @DisplayName("record : débite aussi le garde-débit par minute sur le compte")
    void record_also_feeds_rate_guard() {
        when(workspaceRepository.findOwnerIdByWorkspaceId(10L)).thenReturn(Optional.of(99L));
        when(repository.findByAccountIdAndPeriod(99L, PERIOD)).thenReturn(Optional.empty());
        when(repository.save(any(AiTokenUsage.class))).thenAnswer(inv -> inv.getArgument(0));

        service.record(10L, new LlmUsage(100, 50, 150));

        verify(rateGuard).recordTokens(99L, 150L);
    }
}
