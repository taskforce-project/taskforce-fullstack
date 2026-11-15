package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Le contrat de l'étape d'une mission : les cas de {@code contracts/mission-steps/cases.json}, que l'écran rejoue aussi
 * ({@code mission-sequence.test.ts}). La vue du workflow lit l'étape du serveur, la vue du travail celle de l'écran : un
 * cas qui ne rend pas la même étape des deux côtés fait échouer l'un des deux. Le dossier se lit à {@code ../../contracts}
 * depuis {@code backend/tf-api}, ou là où {@code -Dcontracts.dir} l'indique.
 */
@DisplayName("Contrat de l'étape d'une mission, rejoué côté serveur")
class MissionStepsContractTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static JsonNode contract() {
        Path file = Path.of(System.getProperty("contracts.dir", "../../contracts")).resolve("mission-steps/cases.json");
        try {
            return JSON.readTree(Files.readString(file));
        } catch (IOException e) {
            throw new IllegalStateException("Contract file not found: " + file.toAbsolutePath(), e);
        }
    }

    private static Stream<JsonNode> items(JsonNode array) {
        return StreamSupport.stream(array.spliterator(), false);
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    static Stream<Arguments> cases() {
        return items(contract().get("cases")).map(c -> Arguments.of(
            text(c, "name"),
            text(c, "status"),
            items(c.get("events")).map(e -> new MissionSteps.Event(text(e, "kind"), text(e, "tool"), text(e, "text"))).toList(),
            items(c.get("approvals")).map(a -> new MissionSteps.Request(text(a, "tool"), text(a, "summary"), text(a, "status"))).toList(),
            text(c, "step")));
    }

    @ParameterizedTest(name = "{0} : {4}")
    @MethodSource("cases")
    @DisplayName("chaque cas rend l'étape que l'écran rend")
    void each_case_gives_the_step_of_the_screen(String name, String status, List<MissionSteps.Event> events,
                                                List<MissionSteps.Request> approvals, String step) {
        assertThat(MissionSteps.current(status, events, approvals)).as(name).isEqualTo(step);
    }

    @Test
    @DisplayName("le contrat dit sa forme, et couvre les cinq étapes")
    void the_contract_covers_the_five_steps() {
        JsonNode contract = contract();

        assertThat(text(contract, "format")).isEqualTo("taskforce-mission-steps/1");
        assertThat(items(contract.get("cases")).map(c -> text(c, "step")).distinct())
            .containsExactlyInAnyOrder(MissionSteps.UNDERSTAND, MissionSteps.PLAN, MissionSteps.DO, MissionSteps.CHECK,
                MissionSteps.HANDOVER);
    }
}
