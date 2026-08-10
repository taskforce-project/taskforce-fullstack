package com.taskforce.tf_api.core.service;

import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link AiMeter}. Point clé : {@link AiMeter#metered} <b>décompte</b> la conso,
 * {@link AiMeter#complimentary} passe le <b>même gate de quota</b> mais ne décompte <b>rien</b>
 * (courtoisie de pré-activation — suggestion de compétences de l'onboarding).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AiMeter (métrage vs. offert)")
class AiMeterTest {

    @Mock private AiUsageService usage;
    @Mock private LlmClient llm;

    private static final long WS = 42L;

    @Test
    @DisplayName("metered : gate AVANT l'appel, puis capture + enregistrement de la conso")
    void metered_gates_then_records() throws Exception {
        when(llm.currentUsage()).thenReturn(new LlmUsage(400, 200, 600));
        AiMeter meter = new AiMeter(usage, llm);

        String result = meter.metered(WS, () -> "ok");

        assertThat(result).isEqualTo("ok");
        verify(usage).assertWithinQuota(WS);              // gate armé avant l'appel
        verify(llm).beginUsageCapture();
        verify(usage).record(eq(WS), any(LlmUsage.class)); // conso décomptée
        verify(llm).endUsageCapture();
    }

    @Test
    @DisplayName("complimentary : même gate de quota, mais AUCUN décompte (offert)")
    void complimentary_gates_but_never_records() throws Exception {
        AiMeter meter = new AiMeter(usage, llm);
        AtomicInteger calls = new AtomicInteger();

        String result = meter.complimentary(WS, () -> {
            calls.incrementAndGet();
            return "suggested";
        });

        assertThat(result).isEqualTo("suggested");
        assertThat(calls.get()).isEqualTo(1);             // le travail IA s'exécute bien
        verify(usage).assertWithinQuota(WS);              // le gate protège quand même le LLM
        verify(usage, never()).record(any(), any());      // ... mais rien n'est décompté du quota
        verify(llm, never()).beginUsageCapture();         // ni capture d'usage
        verify(llm, never()).endUsageCapture();
    }

    @Test
    @DisplayName("complimentary : compte au plafond → le gate lève, le LLM n'est pas appelé (repli côté appelant)")
    void complimentary_over_quota_throws_without_calling_llm() {
        AiMeter meter = new AiMeter(usage, llm);
        AtomicInteger calls = new AtomicInteger();
        doThrow(new IllegalStateException("Quota IA mensuel atteint"))
            .when(usage).assertWithinQuota(WS);

        assertThatThrownBy(() -> meter.complimentary(WS, () -> {
            calls.incrementAndGet();
            return "never";
        })).isInstanceOf(IllegalStateException.class);

        assertThat(calls.get()).isZero();                 // gate AVANT l'appel : le LLM n'est pas lancé
        verify(usage, never()).record(any(), any());
    }
}
