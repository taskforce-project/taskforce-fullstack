package com.taskforce.tf_api.core.service.rules;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.harness.rules.Glob;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;

/** Les cas d'une règle (R98) : ceux que TaskForce écrit d'après ses conditions, rejoués par le moteur. */
@DisplayName("Cas d'une règle de l'entreprise")
class RuleCasesTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static List<RulesBundle.Rule> defaults;

    @BeforeAll
    static void loadDefaults() throws Exception {
        try (InputStream in = RuleCasesTest.class.getClassLoader().getResourceAsStream("harness/default.rules.json")) {
            defaults = JSON.readValue(in, RulesBundle.class).rules();
        }
    }

    private static RulesBundle bundle(Map<String, Object> companyRule) {
        List<RulesBundle.Rule> rules = new ArrayList<>();
        if (companyRule != null) {
            Map<String, Object> engine = new LinkedHashMap<>(companyRule);
            engine.put("id", "ws-rule");
            engine.put("class", "sandbox-write");
            engine.put("owner", "admin@example.com");
            engine.put("reason", "A company rule.");
            engine.put("review", "2027-05-11");
            engine.put("layer", "workspace");
            rules.add(JSON.convertValue(engine, RulesBundle.Rule.class));
        }
        rules.addAll(defaults);
        return new RulesBundle(RulesBundle.FORMAT, "acme", null, 1, null, null, rules);
    }

    private static Map<String, Object> accounting() {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("when", Map.of("action", "file.write", "path", "**/accounting/**"));
        rule.put("effect", "ask");
        rule.put("require", Map.of("approvers", List.of("person:42")));
        return rule;
    }

    @Test
    @DisplayName("la règle du CEO : TaskForce écrit le cas couvert et le cas d'à côté, et les deux passent")
    void theCeoRuleGetsTwoPassingCases() {
        Map<String, Object> rule = accounting();

        List<RuleCases.Case> cases = RuleCases.generated(rule, bundle(null));

        assertThat(cases).hasSize(2);
        RuleCases.Case covered = cases.get(0);
        assertThat(covered.facts()).containsEntry("action", "file.write").containsEntry("path", "src/accounting/example.ts")
            .containsEntry("actor", "agent");
        assertThat(covered.expect()).isEqualTo(new RuleCases.Expect("ask", List.of("person:42")));
        RuleCases.Case beside = cases.get(1);
        assertThat(beside.facts()).containsEntry("path", "docs/notes.md");
        assertThat(beside.expect().effect()).isEqualTo("allow");
        assertThat(cases).allSatisfy(c -> assertThat(RuleCases.run(c, bundle(rule)).passed()).isTrue());
    }

    @Test
    @DisplayName("un cas qui attend une demande à la responsable échoue quand la règle n'est pas là")
    void aCaseFailsWithoutItsRule() {
        RuleCases.Case covered = RuleCases.generated(accounting(), bundle(null)).get(0);

        assertThat(RuleCases.run(covered, bundle(null)).passed()).isFalse();
    }

    @Test
    @DisplayName("une règle déjà plus stricte ailleurs ne change rien : son cas échoue, elle n'entre pas")
    void aShadowedRuleFails() {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("when", Map.of("action", "shell", "command", "git push**"));
        rule.put("effect", "ask");

        RuleCases.Case covered = RuleCases.generated(rule, bundle(null)).get(0);
        RuleCases.Outcome outcome = RuleCases.run(covered, bundle(rule));

        assertThat(outcome.decision().effect()).isEqualTo("deny");
        assertThat(outcome.passed()).isFalse();
    }

    @Test
    @DisplayName("un seuil : au-dessus, le cas couvert ; au seuil, le cas d'à côté")
    void thresholdCases() {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("when", Map.of("action", "mcp.write", "server", "invoices", "over", Map.of("fact", "arg.amount", "value", 5000)));
        rule.put("effect", "ask");
        rule.put("require", Map.of("approvers", List.of("role:owner"), "separate", true));

        List<RuleCases.Case> cases = RuleCases.generated(rule, bundle(null));

        assertThat(cases.get(0).facts()).containsEntry("arg.amount", "5001").containsEntry("server", "invoices");
        assertThat(cases.get(1).facts()).containsEntry("server", "another-tool");
        assertThat(cases).allSatisfy(c -> assertThat(RuleCases.run(c, bundle(rule)).passed()).isTrue());
    }

    @Test
    @DisplayName("un motif qui couvre tout n'a pas de cas d'à côté")
    void noBesideForAPatternThatCoversAll() {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("when", Map.of("action", "file.write", "path", "**"));
        rule.put("effect", "ask");

        assertThat(RuleCases.generated(rule, bundle(null))).hasSize(1);
    }

    @Test
    @DisplayName("sans action, la première action qui produit les faits de la règle")
    void firstActionForTheFacts() {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("when", Map.of("command", "docker **"));
        rule.put("effect", "ask");

        RuleCases.Case covered = RuleCases.generated(rule, bundle(null)).get(0);

        assertThat(covered.facts()).containsEntry("action", "git.commit").containsEntry("command", "docker example");
    }

    @ParameterizedTest(name = "{0} : {1}")
    @CsvSource({
        "'**/accounting/**', true, src/accounting/example.ts",
        "'src/*.ts',         true, src/example.ts",
        "'{npm,yarn} test',  false, npm test",
        "'git push**',       false, git pushexample",
        "'docs/{a,b}/*.md',  true, docs/a/example.md",
    })
    void examplesFollowTheirPattern(String pattern, boolean path, String expected) {
        String example = RuleCases.example(pattern, path);

        assertThat(example).isEqualTo(expected);
        assertThat(Glob.matches(pattern, example)).isTrue();
    }

    @Test
    @DisplayName("ce qu'un cas attend : l'effet, et la liste de personnes désignées qu'une demande doit porter")
    void holds() {
        RuleCases.Case wantsFinance = new RuleCases.Case(null, Map.of("action", "file.write", "path", "src/accounting/a.ts"),
            new RuleCases.Expect("ask", List.of("person:42")), RuleCases.BY_MODEL);
        RuleCases.Case wantsSomeoneElse = new RuleCases.Case(null, Map.of("action", "file.write", "path", "src/accounting/a.ts"),
            new RuleCases.Expect("ask", List.of("person:7")), RuleCases.BY_MODEL);

        assertThat(RuleCases.run(wantsFinance, bundle(accounting())).passed()).isTrue();
        assertThat(RuleCases.run(wantsSomeoneElse, bundle(accounting())).passed()).isFalse();
        assertThat(RuleCases.run(wantsFinance, bundle(null)).passed()).isFalse();
    }
}
