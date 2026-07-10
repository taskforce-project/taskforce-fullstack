package com.taskforce.tf_api.core.service.agent;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests unitaires — {@link AnalysisPlan}, le plan d'étapes d'un workflow d'analyse.
 *
 * <p>Le plan est le contrat entre le backend et le composant {@code AgentPlan} du front, et il
 * transite par la base sous forme de JSON : on vérifie donc sa forme, la propagation d'un statut
 * aux sous-étapes, et surtout qu'un plan corrompu ne fasse jamais échouer un workflow.
 */
class AnalysisPlanTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode task(AnalysisPlan plan, String id) {
        for (JsonNode task : plan.toJsonNode()) {
            if (id.equals(task.path("id").asText())) return task;
        }
        return null;
    }

    @Test
    @DisplayName("plan rapide : 4 étapes, sans clarification, toutes en attente")
    void quickPlanHasNoClarifyStep() {
        AnalysisPlan plan = AnalysisPlan.initial(mapper, false);

        assertThat(plan.toJsonNode()).hasSize(4);
        assertThat(task(plan, AnalysisPlan.CLARIFY)).isNull();
        assertThat(task(plan, AnalysisPlan.OBSERVE).path("status").asText()).isEqualTo(AnalysisPlan.PENDING);
    }

    @Test
    @DisplayName("plan approfondi : l'étape de clarification existe et dépend de l'analyse")
    void deepPlanAddsClarifyStep() {
        AnalysisPlan plan = AnalysisPlan.initial(mapper, true);

        assertThat(plan.toJsonNode()).hasSize(5);
        JsonNode clarify = task(plan, AnalysisPlan.CLARIFY);
        assertThat(clarify).isNotNull();
        assertThat(clarify.path("dependencies").get(0).asText()).isEqualTo(AnalysisPlan.ANALYZE);

        // La persistance attend la clarification, pas seulement l'analyse.
        assertThat(task(plan, AnalysisPlan.PERSIST).path("dependencies").get(0).asText())
            .isEqualTo(AnalysisPlan.CLARIFY);
    }

    @ParameterizedTest(name = "statut « {0} » propagé aux sous-étapes")
    @ValueSource(strings = {
        AnalysisPlan.IN_PROGRESS, AnalysisPlan.COMPLETED, AnalysisPlan.NEED_HELP, AnalysisPlan.FAILED,
    })
    @DisplayName("changer le statut d'une étape aligne ses sous-étapes")
    void statusCascadesToSubtasks(String status) {
        AnalysisPlan plan = AnalysisPlan.initial(mapper, false).status(AnalysisPlan.OBSERVE, status);

        JsonNode observe = task(plan, AnalysisPlan.OBSERVE);
        assertThat(observe.path("status").asText()).isEqualTo(status);
        assertThat(observe.path("subtasks")).isNotEmpty();
        for (JsonNode subtask : observe.path("subtasks")) {
            assertThat(subtask.path("status").asText()).isEqualTo(status);
        }
        // Les autres étapes ne bougent pas.
        assertThat(task(plan, AnalysisPlan.CONTEXT).path("status").asText()).isEqualTo(AnalysisPlan.PENDING);
    }

    @Test
    @DisplayName("un statut sur une étape absente est ignoré (plan rapide sans clarification)")
    void statusOnMissingStepIsIgnored() {
        AnalysisPlan plan = AnalysisPlan.initial(mapper, false);

        assertThat(plan.status(AnalysisPlan.CLARIFY, AnalysisPlan.COMPLETED).toJsonNode()).hasSize(4);
    }

    @Test
    @DisplayName("failRunning ne marque en échec que les étapes en cours")
    void failRunningOnlyTouchesInProgressSteps() {
        AnalysisPlan plan = AnalysisPlan.initial(mapper, false)
            .status(AnalysisPlan.OBSERVE, AnalysisPlan.COMPLETED)
            .status(AnalysisPlan.CONTEXT, AnalysisPlan.IN_PROGRESS)
            .failRunning();

        assertThat(task(plan, AnalysisPlan.OBSERVE).path("status").asText()).isEqualTo(AnalysisPlan.COMPLETED);
        assertThat(task(plan, AnalysisPlan.CONTEXT).path("status").asText()).isEqualTo(AnalysisPlan.FAILED);
        assertThat(task(plan, AnalysisPlan.ANALYZE).path("status").asText()).isEqualTo(AnalysisPlan.PENDING);
    }

    @Test
    @DisplayName("un plan relu depuis la base conserve les statuts déjà joués")
    void parsePreservesStatuses() {
        String stored = AnalysisPlan.initial(mapper, true)
            .status(AnalysisPlan.OBSERVE, AnalysisPlan.COMPLETED)
            .toJson();

        AnalysisPlan reloaded = AnalysisPlan.parse(mapper, stored);

        assertThat(reloaded.toJsonNode()).hasSize(5);
        assertThat(task(reloaded, AnalysisPlan.OBSERVE).path("status").asText()).isEqualTo(AnalysisPlan.COMPLETED);
        assertThat(task(reloaded, AnalysisPlan.ANALYZE).path("status").asText()).isEqualTo(AnalysisPlan.PENDING);
    }

    @ParameterizedTest(name = "plan illisible « {0} » → plan vide, jamais d''exception")
    @ValueSource(strings = { "", "   ", "{\"pas\":\"un tableau\"}", "[[[", "null" })
    @DisplayName("un plan corrompu ne fait jamais échouer le workflow")
    void parseNeverThrowsOnCorruptedJson(String corrupted) {
        AnalysisPlan plan = AnalysisPlan.parse(mapper, corrupted);

        assertThat(plan.toJsonNode()).isEmpty();
        assertThat(plan.toJson()).isEqualTo("[]");
    }
}
