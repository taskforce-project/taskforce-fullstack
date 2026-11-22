package com.taskforce.tf_api.core.harness.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * L'en-tête d'un export vient de la chaîne (n°28, pièce 2 : « l'en-tête de l'export hors de la chaîne ») : un en-tête
 * changé après coup ne correspond plus à ses événements.
 */
@DisplayName("L'en-tête d'un dossier, tiré de sa chaîne")
class EvidenceHeaderTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static JsonNode event(String json) throws Exception {
        return JSON.readTree(json);
    }

    @Test
    @DisplayName("mission.started donne tout l'en-tête ; la note de l'agent donne le modèle lancé et sa version")
    void the_chain_gives_the_whole_header() throws Exception {
        List<JsonNode> events = List.of(
            event("{\"type\":\"mission.started\",\"data\":{\"mission\":42,\"workspace\":\"acme\",\"project\":12,\"issue\":\"WEB-12\","
                + "\"requestedBy\":\"ada@taskforce.dev\",\"agent\":{\"kind\":\"claude-code\",\"model\":\"sonnet\"},"
                + "\"rules\":{\"version\":3,\"digest\":\"sha256:aa\",\"layers\":[]},\"runner\":\"tf-runner-ada\",\"taskforce\":null}}"),
            event("{\"type\":\"note\",\"data\":{\"kind\":\"agent\",\"version\":\"2.1.300\",\"model\":\"claude-sonnet-5-20261001\"}}"),
            event("{\"type\":\"mission.ended\",\"data\":{\"status\":\"DONE\"}}"));

        EvidenceHeader.Projection projection = EvidenceHeader.of(events);

        assertThat(projection.covered()).containsExactly("id", "workspace", "project", "issue", "requestedBy", "agent", "rules",
            "runner", "taskforce");
        assertThat(CanonicalJson.of(projection.header())).isEqualTo("{\"agent\":{\"kind\":\"claude-code\","
            + "\"model\":\"claude-sonnet-5-20261001\",\"version\":\"2.1.300\"},\"id\":42,\"issue\":\"WEB-12\",\"project\":12,"
            + "\"requestedBy\":\"ada@taskforce.dev\",\"rules\":{\"digest\":\"sha256:aa\",\"version\":3},\"runner\":\"tf-runner-ada\","
            + "\"taskforce\":null,\"workspace\":\"acme\"}");
    }

    @Test
    @DisplayName("sans note de l'agent, le modèle choisi à la délégation, et une version inconnue")
    void without_the_agent_note_the_chosen_model() throws Exception {
        EvidenceHeader.Projection projection = EvidenceHeader.of(List.of(event(
            "{\"type\":\"mission.started\",\"data\":{\"agent\":{\"kind\":\"claude-code\",\"model\":\"sonnet\"}}}")));

        assertThat(projection.header().get("agent").get("model").asText()).isEqualTo("sonnet");
        assertThat(projection.header().get("agent").get("version").isNull()).isTrue();
    }

    @Test
    @DisplayName("un dossier d'avant la 1.18 ne couvre qu'une partie de l'en-tête, et le dit")
    void an_older_dossier_covers_part_of_the_header() throws Exception {
        EvidenceHeader.Projection projection = EvidenceHeader.of(List.of(event(
            "{\"type\":\"mission.started\",\"data\":{\"issue\":\"WEB-12\",\"requestedBy\":\"ada@taskforce.dev\","
                + "\"agent\":{\"kind\":\"claude-code\",\"model\":null},\"rules\":{\"version\":1,\"digest\":\"sha256:bb\"},"
                + "\"runner\":\"tf-runner-ada\"}}")));

        assertThat(projection.covered()).containsExactly("issue", "requestedBy", "agent", "rules", "runner");
        assertThat(projection.header().has("id")).isFalse();
    }

    @Test
    @DisplayName("sans mission.started, rien n'est couvert")
    void without_a_start_nothing_is_covered() throws Exception {
        assertThat(EvidenceHeader.of(List.of(event("{\"type\":\"note\",\"data\":{}}"))).covered()).isEmpty();
    }
}
