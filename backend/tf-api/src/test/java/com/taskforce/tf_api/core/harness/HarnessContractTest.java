package com.taskforce.tf_api.core.harness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.harness.rules.Glob;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesDigest;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;

/**
 * Tests de contrat (R16) : les cas partagés de {@code contracts/}, que le runner rejoue à l'identique. Le dossier se
 * lit à {@code ../../contracts} depuis {@code backend/tf-api}, ou là où {@code -Dcontracts.dir} l'indique (conteneur
 * de {@code scripts/it.ps1}).
 */
@DisplayName("Contrats du harnais : règles et preuve")
class HarnessContractTest {

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

    private static RulesBundle defaults() {
        return JSON.convertValue(contract("rules/default.rules.json"), RulesBundle.class);
    }

    static Stream<Arguments> globCases() {
        return items(contract("rules/cases.json").get("globs")).map(c -> Arguments.of(
            c.get("pattern").asText(), c.get("value").asText(), c.get("match").asBoolean()));
    }

    static Stream<Arguments> decisionCases() {
        return items(contract("rules/cases.json").get("decisions")).map(c -> {
            Map<String, String> facts = new HashMap<>();
            c.get("facts").fields().forEachRemaining(f -> facts.put(f.getKey(), f.getValue().asText()));
            JsonNode expect = c.get("expect");
            String rule = expect.get("rule").isNull() ? null : expect.get("rule").asText();
            return Arguments.of(c.get("name").asText(), facts, expect.get("effect").asText(), rule);
        });
    }

    static Stream<Arguments> canonicalCases() {
        return items(contract("evidence/chain-cases.json").get("canonical")).map(c -> Arguments.of(
            c.get("name").asText(), c.get("value"), c.get("canonical").asText()));
    }

    @ParameterizedTest(name = "{0} sur « {1} » : {2}")
    @MethodSource("globCases")
    void glob(String pattern, String value, boolean match) {
        assertThat(Glob.matches(pattern, value)).isEqualTo(match);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("decisionCases")
    void decision(String name, Map<String, String> facts, String effect, String rule) {
        RulesEngine.Decision decision = RulesEngine.decide(defaults(), facts);
        assertThat(decision.effect()).isEqualTo(effect);
        assertThat(decision.rule() == null ? null : decision.rule().id()).isEqualTo(rule);
    }

    @Test
    @DisplayName("chaque règle par défaut a un propriétaire, une raison et une date de revue (R2)")
    void defaultRulesAreOwned() {
        assertThat(defaults().rules()).allSatisfy(r -> {
            assertThat(r.owner()).isNotBlank();
            assertThat(r.reason()).isNotBlank();
            assertThat(r.review()).matches("\\d{4}-\\d{2}-\\d{2}");
        });
    }

    @Test
    @DisplayName("l'empreinte du paquet par défaut est celle du cas de référence, nuls et empreinte compris ou non")
    void digestMatchesReference() {
        String expected = contract("rules/cases.json").get("digest").get("expected").asText();
        ObjectNode bundle = (ObjectNode) contract("rules/default.rules.json");
        assertThat(RulesDigest.of(bundle)).isEqualTo(expected);

        ObjectNode withDigestAndMoreNulls = bundle.deepCopy();
        withDigestAndMoreNulls.put("digest", "sha256:" + "f".repeat(64));
        withDigestAndMoreNulls.putNull("issuedAt");
        assertThat(RulesDigest.of(withDigestAndMoreNulls)).isEqualTo(expected);
    }

    @Test
    @DisplayName("la table par défaut embarquée dans le serveur est celle du contrat")
    void embeddedDefaultsMatchContract() throws IOException {
        try (var in = getClass().getClassLoader().getResourceAsStream("harness/default.rules.json")) {
            assertThat(in).isNotNull();
            assertThat(JSON.readTree(in)).isEqualTo(contract("rules/default.rules.json"));
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("canonicalCases")
    void canonical(String name, JsonNode value, String expected) {
        assertThat(CanonicalJson.of(value)).isEqualTo(expected);
    }

    @Test
    @DisplayName("un nombre décimal est refusé")
    void decimalRefused() {
        assertThatThrownBy(() -> CanonicalJson.of(JSON.createObjectNode().put("score", 0.5)))
            .hasMessageContaining("Decimal numbers");
    }

    private static List<ObjectNode> referenceEvents() {
        List<ObjectNode> events = new ArrayList<>();
        contract("evidence/chain-cases.json").get("chain").get("events").forEach(e -> events.add((ObjectNode) e));
        return events;
    }

    @Test
    @DisplayName("la chaîne donne les mêmes empreintes que le cas de référence")
    void chainMatchesReference() {
        JsonNode cases = contract("evidence/chain-cases.json");
        assertThat(EvidenceChain.ZERO_HASH).isEqualTo(cases.get("zero").asText());
        List<ObjectNode> chained = EvidenceChain.chain(referenceEvents());
        JsonNode links = cases.get("chain").get("links");
        for (int i = 0; i < chained.size(); i++) {
            assertThat(chained.get(i).get("prev").asText()).isEqualTo(links.get(i).get("prev").asText());
            assertThat(chained.get(i).get("hash").asText()).isEqualTo(links.get(i).get("hash").asText());
        }
        assertThat(chained.getLast().get("hash").asText()).isEqualTo(cases.get("chain").get("root").asText());
    }

    @Test
    @DisplayName("un événement modifié ou retiré se voit, au bon endroit")
    void tamperingIsSeen() {
        List<ObjectNode> chained = EvidenceChain.chain(referenceEvents());
        assertThat(EvidenceChain.firstBrokenLink(chained)).isEqualTo(-1);

        List<ObjectNode> tampered = new ArrayList<>(chained.stream().map(ObjectNode::deepCopy).toList());
        ((ObjectNode) tampered.get(2).get("data")).put("version", "3.1.1");
        assertThat(EvidenceChain.firstBrokenLink(tampered)).isEqualTo(2);

        assertThat(EvidenceChain.firstBrokenLink(List.of(chained.get(0), chained.get(2), chained.get(3)))).isEqualTo(1);
    }
}
