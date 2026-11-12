package com.taskforce.tf_api.core.service.rules;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** La validation sans modèle d'une règle de l'entreprise (R157, R98) : le format, le socle, les faits produits. */
@DisplayName("Validation d'une règle de l'entreprise")
class RuleValidatorTest {

    private static final Set<Long> MEMBERS = Set.of(7L, 42L);

    private static Map<String, Object> rule(Map<String, Object> when, String effect, Map<String, Object> require) {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("when", when);
        rule.put("effect", effect);
        if (require != null) {
            rule.put("require", require);
        }
        return rule;
    }

    private static List<String> codes(Map<String, Object> rule) {
        return RuleValidator.check(rule, MEMBERS).stream().map(RuleValidator.Problem::code).toList();
    }

    @Test
    @DisplayName("la règle du CEO passe : demander à la responsable avant tout changement du module comptable")
    void theCeoRulePasses() {
        Map<String, Object> rule = rule(Map.of("action", "file.write", "path", "**/accounting/**"), "ask",
            Map.of("approvers", List.of("person:42")));

        assertThat(RuleValidator.check(rule, MEMBERS)).isEmpty();
    }

    @Test
    @DisplayName("une couche de l'entreprise ne relâche rien : une règle qui autorise est refusée")
    void allowIsRefused() {
        assertThat(codes(rule(Map.of("action", "issue.delete"), "allow", null))).containsExactly("loosens");
    }

    @Test
    @DisplayName("les règles elles-mêmes sont à TaskForce : une règle sur leur changement est refusée")
    void harnessChangeIsTaskForces() {
        assertThat(codes(rule(Map.of("action", "harness.change"), "deny", null))).contains("rulesAreTaskForce");
    }

    @ParameterizedTest(name = "{0} : {1}")
    @CsvSource({
        "payment,       unknownAction",   // aucune action de ce nom : retirée du contrat
        "deploy,        unknownAction",
        "file.delete,   unknownAction",
    })
    void anActionOutsideTheContractIsRefused(String action, String code) {
        assertThat(codes(rule(Map.of("action", action), "ask", null))).contains(code);
    }

    @Test
    @DisplayName("une condition sur un fait que TaskForce ne produit pas pour cette action ne s'appliquerait jamais")
    void aConditionThatNeverHolds() {
        assertThat(RuleValidator.check(rule(Map.of("action", "file.write", "branch", "main"), "ask", null), MEMBERS))
            .containsExactly(new RuleValidator.Problem("neverApplies", "branch"));
        assertThat(codes(rule(Map.of("action", "comment.create", "sensitivity", "confidential"), "ask", null)))
            .contains("neverApplies");
    }

    @Test
    @DisplayName("une règle de l'entreprise nomme son action : sans elle, elle couvrirait aussi celle que TaskForce garde")
    void withoutActionIsRefused() {
        assertThat(codes(rule(Map.of("path", "**/accounting/**"), "ask", null))).containsExactly("noAction");
        assertThat(codes(rule(Map.of("actor", "person"), "deny", null))).containsExactly("noAction");
        assertThat(codes(rule(Map.of("path", "x", "branch", "main"), "ask", null))).containsExactly("noAction");
    }

    @Test
    @DisplayName("un seuil porte sur l'argument chiffré d'un outil de l'entreprise, en nombre entier")
    void thresholds() {
        Map<String, Object> over = Map.of("fact", "arg.amount", "value", 5000);
        assertThat(RuleValidator.check(rule(Map.of("action", "mcp.write", "server", "invoices", "over", over), "ask",
            Map.of("approvers", List.of("role:owner"), "separate", true)), MEMBERS)).isEmpty();
        assertThat(codes(rule(Map.of("action", "file.write", "over", over), "ask", null))).contains("neverApplies");
        assertThat(codes(rule(Map.of("action", "mcp.write", "over", Map.of("fact", "amount", "value", 5)), "ask", null)))
            .contains("badPattern");
        assertThat(codes(rule(Map.of("action", "mcp.write", "over", Map.of("fact", "arg.amount", "value", 5.5)), "ask",
            null))).contains("badPattern");
    }

    @Test
    @DisplayName("qui accorde : une personne de l'espace, un rôle, le responsable du projet ; rien d'autre")
    void approvers() {
        Map<String, Object> when = Map.of("action", "issue.delete");
        assertThat(codes(rule(when, "ask", Map.of("approvers", List.of("person:99"))))).containsExactly("notAMember");
        assertThat(codes(rule(when, "ask", Map.of("approvers", List.of("the boss"))))).containsExactly("badApprover");
        assertThat(codes(rule(when, "ask", Map.of("approvers", List.of())))).containsExactly("badPattern");
        assertThat(codes(rule(when, "ask", Map.of("approvers", List.of("role:admin", "project-lead"), "signatures", 2))))
            .isEmpty();
        assertThat(codes(rule(when, "ask", Map.of("signatures", 4)))).containsExactly("badPattern");
        assertThat(codes(rule(when, "ask", Map.of("separate", "yes")))).containsExactly("badPattern");
        assertThat(codes(rule(when, "ask", Map.of("quorum", 2)))).containsExactly("badPattern");
    }

    @Test
    @DisplayName("les obligations ne vont qu'avec une règle qui demande")
    void requireOnlyWhenAsking() {
        assertThat(codes(rule(Map.of("action", "issue.delete"), "deny", Map.of("signatures", 2))))
            .containsExactly("requireOnlyWhenAsking");
    }

    @Test
    @DisplayName("une règle sans condition, sans effet ou avec une condition inconnue est refusée")
    void malformed() {
        assertThat(codes(rule(Map.of(), "ask", null))).containsExactly("noCondition");
        assertThat(codes(rule(Map.of("action", "issue.delete"), "maybe", null))).containsExactly("noEffect");
        assertThat(codes(rule(Map.of("action", "issue.delete", "mood", "grumpy"), "ask", null))).contains("unknownCondition");
        assertThat(codes(rule(Map.of("action", "shell", "command", ""), "ask", null))).contains("badPattern");
        assertThat(codes(rule(Map.of("action", "git.push", "repoVisibility", "internal"), "ask", null))).contains("badPattern");
        assertThat(codes(rule(Map.of("action", "issue.create", "actor", "robot"), "ask", null))).contains("badPattern");
        assertThat(codes(rule(Map.of("action", "issue.create"), "ask", null))).isEmpty();
        Map<String, Object> notAMap = new LinkedHashMap<>();
        notAMap.put("when", "everything");
        notAMap.put("effect", "deny");
        assertThat(codes(notAMap)).containsExactly("noCondition");
    }
}
