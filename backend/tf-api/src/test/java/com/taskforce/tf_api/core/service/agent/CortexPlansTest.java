package com.taskforce.tf_api.core.service.agent;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Les plans des demandes courantes (R117, séance n°17) : chacun tient sur un écran, ne nomme que des gestes que Cortex
 * a, et TaskForce le choisit sur la demande, avant le modèle, sans lui laisser le choix.
 */
@DisplayName("Les plans des demandes courantes")
class CortexPlansTest {

    /** Les outils de Cortex : les siens, puis les gestes du MCP TaskForce qu'il fait dans la conversation. */
    private static final Set<String> CORTEX_TOOLS = Set.of("search_brain", "list_projects", "list_issues", "find_integration",
        "create_issue", "create_note", "update_issue", "add_comment", "delegate_issue", "get_mission", "delete_issue",
        "create_project");
    private static final Pattern TOOL_NAME = Pattern.compile("\\b[a-z]+(_[a-z]+)+\\b");

    static List<String> plans() {
        return CortexPlans.IDS;
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("plans")
    @DisplayName("un plan tient sur un écran (la condition de Rus) et ne nomme que les gestes qu'il déclare, qui existent")
    void a_plan_fits_on_one_screen_and_names_real_gestures(String id) {
        CortexPlans.Plan plan = CortexPlans.all().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();

        assertThat(plan.text().lines().count()).isLessThanOrEqualTo(CortexPlans.MAX_LINES);
        assertThat(plan.text().length()).isLessThanOrEqualTo(CortexPlans.MAX_CHARS);
        assertThat(plan.text()).doesNotContain("—"); // pas de tiret cadratin
        assertThat(plan.gestures()).isNotEmpty().allMatch(CORTEX_TOOLS::contains);
        Set<String> named = new HashSet<>();
        Matcher found = TOOL_NAME.matcher(plan.text());
        while (found.find()) named.add(found.group());
        named.removeAll(Set.of("create_issue")); // nommé pour l'interdire : « never prepare an issue (create_issue) »
        assertThat(plan.gestures()).containsAll(named);
    }

    /**
     * Les demandes de la Présidence et leurs voisines, en français et en anglais : le plan qu'elles appellent, ou aucun.
     * Une demande qui en nomme deux prend celui qu'elle nomme d'abord.
     */
    @ParameterizedTest(name = "« {0} » : {1}")
    @CsvSource(delimiter = '|', quoteCharacter = '"', nullValues = "-", value = {
        "supprime l issue qu il y a dans in review by AI parce qu'on l'a deja faite | delete",
        "suprime testta 2                                         | delete",
        "nan je veux que tu supprime la carte justement           | delete",
        "Delete TF-12, it's a duplicate                           | delete",
        "remove the issue TF-3                                    | delete",
        "retire TESTTA-2 du tableau                               | delete",
        "crée un projet Next.js                                   | create-project",
        "Create a new project for the website                     | create-project",
        "on lance un nouveau projet mobile                        | create-project",
        "déplace TESTTA-3 dans In Progress                        | move-assign",
        "assigne-moi TESTTA-3                                     | move-assign",
        "Move TF-12 to Done and assign it to me                   | move-assign",
        "passe TF-4 en review                                     | move-assign",
        "What changed in this project this week?                  | what-changed",
        "qu'est-ce qui a changé cette semaine dans test taskforce ? | what-changed",
        "quoi de neuf sur le projet ?                             | what-changed",
        "résume le projet test taskforce                          | summarize",
        "Summarize this board                                     | summarize",
        "où en est la mission de TF-12 ?                          | summarize",
        "supprime TF-12 et résume le projet                       | delete",
        "liste moi les issues dans test taskforce                 | -",
        "la note Ajouter la version LTS la                        | -",
        "crée une issue pour supprimer le README                  | -",
        "crée une issue dans le projet Web                        | -",
        "ajoute une issue et assigne-la moi                       | -",
        "bonjour                                                  | -",
    })
    void taskforce_picks_the_plan_of_the_request(String message, String plan) {
        assertThat(CortexPlans.forRequest(message).map(CortexPlans.Plan::id).orElse(null)).isEqualTo(plan);
    }

    @Test
    void no_plan_for_an_empty_request() {
        assertThat(CortexPlans.forRequest(null)).isEmpty();
        assertThat(CortexPlans.forRequest("   ")).isEmpty();
    }

    @Test
    @DisplayName("un plan sans formes de demande ou sans texte ne se charge pas")
    void a_plan_needs_its_match_and_its_text() {
        assertThatThrownBy(() -> CortexPlans.parse("broken", "gestures: list_issues\n---\nPlan."))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("broken");
        assertThatThrownBy(() -> CortexPlans.parse("broken", "match: \\bdelete\\b\nPlan without separator."))
            .isInstanceOf(IllegalStateException.class);

        CortexPlans.Plan parsed = CortexPlans.parse("ok", "match: \\bdelete\\b\r\ngestures: delete_issue, list_issues\r\n---\r\n\r\nPlan.\r\n");
        assertThat(parsed.text()).isEqualTo("Plan.");
        assertThat(parsed.gestures()).containsExactly("delete_issue", "list_issues");
        assertThat(parsed.unless()).isNull();
    }
}
