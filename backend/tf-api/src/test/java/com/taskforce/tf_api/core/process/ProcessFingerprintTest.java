package com.taskforce.tf_api.core.process;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * L'empreinte d'un processus (ADR-027, point 7) porte sur le contenu de son modèle, jamais sur son texte : l'ordre des
 * étapes et des chemins, un champ nul ou absent, une liste vide, des blancs autour d'un mot n'y changent rien ; un mot,
 * une étape, un réglage la changent.
 */
@DisplayName("L'empreinte d'un processus")
class ProcessFingerprintTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static String digest(ObjectNode root) {
        return ProcessFingerprint.of(ProcessValidatorTest.model(root));
    }

    @Test
    @DisplayName("elle a la forme des empreintes de TaskForce")
    void shape() {
        assertThat(ProcessFingerprint.of(ProcessFixtures.integrateAModule())).matches("sha256:[0-9a-f]{64}");
    }

    @Test
    @DisplayName("l'ordre des étapes, des chemins, des règles et des outils ne compte pas")
    void order_does_not_count() {
        ObjectNode a = ProcessValidatorTest.e20();
        ObjectNode b = ProcessValidatorTest.e20();
        reverse(ProcessValidatorTest.steps(b));
        reverse(ProcessValidatorTest.flows(b));
        reverse(ProcessValidatorTest.steps(ProcessValidatorTest.step(b, "build")));
        reverse((ArrayNode) ProcessValidatorTest.step(b, "build-zone").get("rules"));

        assertThat(digest(b)).isEqualTo(digest(a));
    }

    @Test
    @DisplayName("un champ nul, absent, vide ou entouré de blancs ne compte pas")
    void empty_does_not_count() {
        ObjectNode a = ProcessValidatorTest.e20();
        ObjectNode b = ProcessValidatorTest.e20();
        ObjectNode step = ProcessValidatorTest.step(b, "write-scope");
        step.putNull("description");
        step.putArray("documents");
        step.put("terminate", false);
        step.put("name", "  Write the module's   scope ");
        ((ObjectNode) ProcessValidatorTest.flow(b, "frame-start-write-scope")).put("otherwise", false);

        assertThat(digest(b)).isEqualTo(digest(a));
    }

    @Test
    @DisplayName("un mot, une étape ou un réglage changé change l'empreinte")
    void content_counts() {
        String base = digest(ProcessValidatorTest.e20());

        ObjectNode word = ProcessValidatorTest.e20();
        ProcessValidatorTest.step(word, "write-scope").put("name", "Write the scope");
        ObjectNode setting = ProcessValidatorTest.e20();
        ((ObjectNode) ProcessValidatorTest.step(setting, "write-code").get("agent")).put("attempts", 2);
        ObjectNode line = ProcessValidatorTest.e20();
        reverse((ArrayNode) ProcessValidatorTest.step(line, "before-mission").get("human").get("checklist"));

        assertThat(List.of(digest(word), digest(setting), digest(line))).doesNotContain(base).doesNotHaveDuplicates();
    }

    private static void reverse(ArrayNode array) {
        List<JsonNode> items = new ArrayList<>();
        array.forEach(items::add);
        Collections.reverse(items);
        array.removeAll();
        items.forEach(array::add);
    }

    @Test
    @DisplayName("le JSON du modèle n'écrit ni champ nul ni méthode d'aide")
    void json_shape() {
        ObjectNode tree = JSON.valueToTree(ProcessFixtures.integrateAModule());
        ObjectNode zone = ProcessValidatorTest.step(tree, "build-zone");
        ObjectNode wait = ProcessValidatorTest.step(tree, "acceptance-report");

        assertThat(zone).isNotNull();
        assertThat(zone.has("container")).isFalse();
        assertThat(zone.has("workStep")).isFalse();
        assertThat(zone.has("boundary")).isFalse();
        assertThat(zone.has("terminate")).isFalse();
        assertThat(wait.has("wait")).isTrue();
        assertThat(wait.has("waitFor")).isFalse();
        assertThat(tree.toString()).doesNotContain("null");
    }
}
