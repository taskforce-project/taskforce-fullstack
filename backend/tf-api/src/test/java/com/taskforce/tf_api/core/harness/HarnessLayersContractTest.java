package com.taskforce.tf_api.core.harness;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
import com.taskforce.tf_api.core.harness.rules.RulesFloor;
import com.taskforce.tf_api.core.harness.rules.SecretScan;

/**
 * Tests de contrat des règles par couches et du socle (R157) : les cas de {@code contracts/rules/layer-cases.json}, que
 * le runner rejoue à l'identique contre le même moteur compilé en JavaScript. C'est la preuve que la décision est la même
 * des deux côtés.
 */
@DisplayName("Contrat des règles par couches et du socle")
class HarnessLayersContractTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static JsonNode contract(String path) {
        Path dir = Path.of(System.getProperty("contracts.dir", "../../contracts"));
        try {
            return JSON.readTree(Files.readString(dir.resolve(path)));
        } catch (IOException e) {
            throw new IllegalStateException("Contract file not found: " + dir.resolve(path).toAbsolutePath(), e);
        }
    }

    private static Stream<JsonNode> items(JsonNode array) {
        return StreamSupport.stream(array.spliterator(), false);
    }

    private static Map<String, String> facts(JsonNode node) {
        Map<String, String> facts = new HashMap<>();
        node.fields().forEachRemaining(f -> facts.put(f.getKey(), f.getValue().asText()));
        return facts;
    }

    /** Le paquet d'un cas : ses règles, puis la table par défaut, sauf quand elles sont tout le paquet. */
    private static RulesBundle bundleOf(JsonNode c) {
        List<RulesBundle.Rule> rules = new ArrayList<>(JSON.convertValue(c.get("rules"),
            new TypeReference<List<RulesBundle.Rule>>() {}));
        if (!c.path("replace").asBoolean(false)) {
            rules.addAll(JSON.convertValue(contract("rules/default.rules.json"), RulesBundle.class).rules());
        }
        return new RulesBundle(RulesBundle.FORMAT, "template", null, 1, null, null, rules);
    }

    static Stream<Arguments> layerCases() {
        return items(contract("rules/layer-cases.json").get("cases")).map(c -> Arguments.of(c.get("name").asText(), c));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("layerCases")
    void layered(String name, JsonNode c) {
        RulesBundle bundle = bundleOf(c);
        RulesEngine.Decision decision;
        if (c.has("factsList")) {
            List<Map<String, String>> list = new ArrayList<>();
            c.get("factsList").forEach(f -> list.add(facts(f)));
            decision = RulesEngine.decideAll(bundle, list);
        } else {
            decision = RulesEngine.decide(bundle, facts(c.get("facts")));
        }
        JsonNode expect = c.get("expect");
        assertThat(decision.effect()).isEqualTo(expect.get("effect").asText());
        assertThat(decision.rule() == null ? null : decision.rule().id())
            .isEqualTo(expect.get("rule").isNull() ? null : expect.get("rule").asText());
        JsonNode require = expect.get("require");
        if (require.isNull()) {
            assertThat(decision.require()).isNull();
        } else {
            assertThat(decision.require()).isNotNull();
            assertThat(JSON.<JsonNode>valueToTree(decision.require())).isEqualTo(require);
        }
    }

    static Stream<Arguments> floorClasses() {
        return items(contract("rules/layer-cases.json").get("floorClasses")).map(c -> Arguments.of(
            c.get("facts").toString(), facts(c.get("facts")), c.get("class").isNull() ? null : c.get("class").asText()));
    }

    @ParameterizedTest(name = "{0} : {2}")
    @MethodSource("floorClasses")
    void floorClass(String label, Map<String, String> facts, String expected) {
        assertThat(RulesFloor.classOf(facts)).isEqualTo(expected);
    }

    static Stream<Arguments> secrets() {
        return items(contract("rules/layer-cases.json").get("secrets")).map(c -> Arguments.of(
            c.get("text").asText(), c.get("secret").asBoolean()));
    }

    @ParameterizedTest(name = "« {0} » : {1}")
    @MethodSource("secrets")
    void secret(String text, boolean secret) {
        assertThat(SecretScan.in(text)).isEqualTo(secret);
    }

    @Test
    @DisplayName("les formats qu'on n'écrit pas en clair dans le dépôt sont reconnus aussi")
    void secretsBuiltAtRunTime() {
        assertThat(SecretScan.in("token " + "glpat-" + "x".repeat(24))).isTrue();
        assertThat(SecretScan.in("-----BEGIN " + "RSA PRIVATE KEY-----")).isTrue();
        assertThat(SecretScan.in("export KEY=" + "sk" + "-ant-" + "a".repeat(40))).isTrue();
        assertThat(SecretScan.in("AKIA" + "ABCDEFGHIJKLMNOP")).isTrue();
        assertThat(SecretScan.in("xox" + "b-" + "1234567890-abc")).isTrue();
        assertThat(SecretScan.in("whsec_" + "Z".repeat(32))).isTrue();
        assertThat(SecretScan.in("a quiet sentence about secrets")).isFalse();
    }

    @Test
    @DisplayName("la table par défaut passe le socle : aucune de ses décisions n'est durcie par lui sur ses propres cas")
    void defaultTableAgreesWithTheFloor() {
        RulesBundle defaults = JSON.convertValue(contract("rules/default.rules.json"), RulesBundle.class);
        assertThat(defaults.rules()).allSatisfy(rule -> {
            assertThat(rule.layer()).isNull();
            // Une règle de TaskForce qui autorise une action d'agent n'est jamais irréversible (R1).
            if (RulesEngine.ALLOW.equals(rule.effect()) && !"person".equals(rule.when().actor())) {
                assertThat(rule.actionClass()).isNotEqualTo(RulesFloor.IRREVERSIBLE);
            }
        });
    }
}
