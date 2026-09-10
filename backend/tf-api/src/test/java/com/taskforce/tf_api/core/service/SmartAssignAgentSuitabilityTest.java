package com.taskforce.tf_api.core.service;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.taskforce.tf_api.core.enums.IssuePriority;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Heuristique agent-vs-humain (TF-AGENT-DELIVERY A3) : {@code SmartAssignService.agentSuitability}
 * decide si une tache se prete a une delegation a un agent. Fonction pure -> testee directement.
 */
@DisplayName("SmartAssignService.agentSuitability")
class SmartAssignAgentSuitabilityTest {

    @Test
    @DisplayName("bug bien specifie, petit, depot lie -> tres adapte (>=65, recommande)")
    void well_defined_bug_is_recommended() {
        // 50 + 15(bug) + 15(spec) + 10(small) + 0(prio none) + 10(repo) = 100
        int s = SmartAssignService.agentSuitability(List.of("bug"), IssuePriority.NONE, 2, true, true);
        assertThat(s).isEqualTo(100);
        assertThat(s).isGreaterThanOrEqualTo(65);
    }

    @Test
    @DisplayName("label 'design' -> veto humain (0)")
    void human_only_label_vetoes() {
        assertThat(SmartAssignService.agentSuitability(List.of("design"), IssuePriority.NONE, 2, true, true)).isZero();
        assertThat(SmartAssignService.agentSuitability(List.of("bug", "decision"), IssuePriority.NONE, 1, true, true)).isZero();
    }

    @Test
    @DisplayName("sans spec, urgent, gros scope -> non adapte (<45)")
    void ambiguous_urgent_large_not_suitable() {
        // 50 - 20(no spec) - 25(large) - 20(urgent) = clamp 0
        int s = SmartAssignService.agentSuitability(List.of(), IssuePriority.URGENT, 13, false, false);
        assertThat(s).isLessThan(45);
    }

    @Test
    @DisplayName("cas moyen (spec, prio haute, taille moyenne, sans depot) -> alternative (45-64)")
    void moderate_case_is_alternative_band() {
        // 50 + 0(no friendly label) + 15(spec) + 0(5 pts) - 10(high) + 0(no repo) = 55
        int s = SmartAssignService.agentSuitability(List.of(), IssuePriority.HIGH, 5, true, false);
        assertThat(s).isEqualTo(55);
        assertThat(s).isBetween(45, 64);
    }

    @Test
    @DisplayName("labels null / vides ne cassent pas + priorite basse restent bornes 0-100")
    void null_and_bounds() {
        assertThat(SmartAssignService.agentSuitability(null, IssuePriority.NONE, null, false, false))
            .isBetween(0, 100);
    }
}
