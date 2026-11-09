package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.ProjectStatus;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.Question;
import com.taskforce.tf_api.core.service.agent.QuestionNeeded;
import com.taskforce.tf_api.core.service.agent.Screen;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/** Le projet d'une demande à Cortex, par sa clé ou son nom, résolu par le code, jamais deviné (R48, séance n°8). */
@ExtendWith(MockitoExtension.class)
@DisplayName("ProjectResolver")
class ProjectResolverTest {

    private static final AgentContext CTX = new AgentContext("acme", 1L, 7L);

    @Mock private ProjectService projectService;

    private ProjectResolver resolver() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of(
            project(3L, "TF", "TaskForce"),
            project(5L, "API", "API Platform"),
            project(8L, "WEB", "Web App"),
            project(9L, "NEXT", "Web App Next")));
        return new ProjectResolver(projectService);
    }

    private static ProjectResponse project(Long id, String key, String name) {
        return ProjectResponse.builder().id(id).identifier(key).name(name).build();
    }

    @ParameterizedTest(name = "« {0} » désigne {1}")
    @CsvSource({
        "TF,        TF",   // la clé
        "tf,        TF",   // sans tenir compte de la casse
        "TaskForce, TF",   // le nom
        "taskforce, TF",
        "platform,  API",  // une partie du nom, quand un seul projet la porte
        "Web App,   WEB",  // le nom exact l'emporte sur celui qui le contient
    })
    void finds_the_project(String asked, String key) {
        ProjectResolver.Resolution r = resolver().resolve(asked, CTX);

        assertThat(r.found()).isTrue();
        assertThat(r.project().getIdentifier()).isEqualTo(key);
        assertThat(r.problem()).isNull();
    }

    @ParameterizedTest(name = "« {0} » : {1}, avec {2}")
    @CsvSource(delimiter = '|', value = {
        "app    | Several projects match | NEXT (Web App Next)",  // deux noms le contiennent : Cortex demande
        "Mobile | No project matches     | TF (TaskForce)",
        "16     | No project matches     | TF (TaskForce)",       // un numéro n'est jamais un identifiant
        "''     | The project is missing | TF (TaskForce)",
    })
    void says_what_to_ask_instead_of_guessing(String asked, String problem, String choice) {
        ProjectResolver.Resolution r = resolver().resolve(asked, CTX);

        assertThat(r.found()).isFalse();
        assertThat(r.problem()).startsWith(problem).contains(choice);
    }

    /** Le contexte d'un tour de Cortex : ce que la personne a écrit, ce que l'écran montre, le projet de la conversation. */
    private static AgentContext turn(String request, Long screen, Long conversation) {
        return new AgentContext("acme", 1L, 7L, new Screen(screen, null), request, conversation, 1L);
    }

    @ParameterizedTest(name = "« {0} », le modèle passe « {1} », écran {2}, conversation {3} : {4}")
    @CsvSource(delimiter = '|', value = {
        // La demande nomme le projet : c'est lui, quels que soient l'écran et la conversation.
        "Crée une issue dans WEB          | WEB       | 3 | 5  | WEB",
        "Create it in the Web App         | Web App   | 3 | 5  | WEB",
        "Crée une issue sur API Platform  | API Platform | 3 | 5 | API",
        "Crée une issue dans platform     | API Platform | 3 | 5 | API",
        // Le modèle l'a oublié : la clé telle qu'elle s'écrit, ou tout le nom après un mot de lieu.
        "Crée une issue pour WEB-4        |           | 3 | 5  | WEB",
        "Crée une issue dans API Platform |           | 3 | 5  | API",
        "Crée une issue in the Web App project |      | 3 | 5  | WEB",
        // La demande ne nomme rien : le projet de la conversation, jamais celui que le modèle a lu à l'écran.
        "Crée une issue Test              | TF        | 3 | 5  | API",
        "Crée une issue Test              |           | 3 | 5  | API",
    })
    void the_project_of_a_gesture(String request, String given, Long screen, Long conversation, String key) {
        ProjectResolver.Resolution r = resolver().forGesture(given, "Test", turn(request, screen, conversation));

        assertThat(r.found()).isTrue();
        assertThat(r.project().getIdentifier()).isEqualTo(key);
    }

    @ParameterizedTest(name = "« {0} », le modèle passe « {1} », écran {2}")
    @CsvSource(delimiter = '|', value = {
        "Crée une issue Test | TF | 3",   // ce que le modèle a lu à l'écran
        "Crée une issue Test |    | 3",
        "Crée une issue Test |    |  ",
    })
    void neither_named_nor_in_a_project_asks(String request, String given, Long screen) {
        assertThatThrownBy(() -> resolver().forGesture(given, "Test", turn(request, screen, null)))
            .isInstanceOfSatisfying(QuestionNeeded.class, needed -> {
                Question question = needed.question();
                assertThat(question.field()).isEqualTo("project");
                assertThat(question.text()).isEqualTo("Which project should \"Test\" go in?");
                assertThat(question.choices()).hasSize(Question.MAX_CHOICES)
                    .noneMatch(Question.Choice::recommended);
            });
    }

    @Test
    @DisplayName("le projet à l'écran vient en tête des choix : il renseigne, il n'est pas coché")
    void the_screen_informs_the_choices() {
        assertThatThrownBy(() -> resolver().forGesture(null, null, turn("Crée une issue", 8L, null)))
            .isInstanceOfSatisfying(QuestionNeeded.class, needed -> {
                assertThat(needed.question().text()).isEqualTo("Which project is this for?");
                assertThat(needed.question().choices().get(0).value()).isEqualTo("WEB");
                assertThat(needed.question().choices().get(0).recommended()).isFalse();
            });
    }

    @ParameterizedTest(name = "« {0} » : {1}")
    @CsvSource(delimiter = '|', value = {
        "Mobile  | No project matches \"Mobile\"",
        "app     | Several projects match \"app\"",
    })
    void what_the_person_typed_on_the_card_is_read_or_asked_again(String typed, String why) {
        // Sur la réponse à une carte, il n'y a pas de demande à relire : le texte passé vient d'elle.
        assertThatThrownBy(() -> resolver().forGesture(typed, "Test", new AgentContext("acme", 1L, 7L)))
            .isInstanceOfSatisfying(QuestionNeeded.class, needed -> assertThat(needed.question().text()).startsWith(why));
    }

    @Test
    @DisplayName("sur la réponse à une carte, le projet choisi est le bon")
    void the_answer_on_a_card_decides() {
        assertThat(resolver().forGesture("WEB", "Test", new AgentContext("acme", 1L, 7L)).project().getIdentifier()).isEqualTo("WEB");
    }

    @Test
    @DisplayName("un seul projet visible : rien à demander")
    void a_single_project_is_not_a_guess() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of(project(3L, "TF", "TaskForce")));

        ProjectResolver.Resolution r = new ProjectResolver(projectService).forGesture(null, "Test", turn("Crée une issue", null, null));

        assertThat(r.project().getIdentifier()).isEqualTo("TF");
    }

    @Test
    @DisplayName("un projet archivé ne se propose pas, et ne compte pas comme un autre choix")
    void an_archived_project_is_not_offered() {
        ProjectResponse archived = ProjectResponse.builder().id(9L).identifier("OLD").name("Old").status(ProjectStatus.ARCHIVED).build();
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of(project(3L, "TF", "TaskForce"), archived));
        ProjectResolver only = new ProjectResolver(projectService);

        assertThat(only.forGesture(null, "Test", turn("Crée une issue", null, null)).project().getIdentifier()).isEqualTo("TF");
        assertThat(only.whichProject("Test", turn("x", null, null))).isEmpty();
    }

    @Test
    @DisplayName("un projet de conversation que la personne ne voit plus ne compte pas : TaskForce demande")
    void a_conversation_project_no_longer_visible_asks() {
        assertThatThrownBy(() -> resolver().forGesture(null, "Test", turn("Crée une issue", null, 99L)))
            .isInstanceOf(QuestionNeeded.class);
    }

    @Test
    @DisplayName("la question du choix du projet, et le projet que la demande écrit")
    void the_correction_helpers() {
        ProjectResolver r = resolver();

        assertThat(r.whichProject("Test", turn("mauvais projet", null, null)).orElseThrow().choices()).isNotEmpty();
        assertThat(r.writtenIn(turn("mets-le dans API Platform", null, null)).orElseThrow().getIdentifier()).isEqualTo("API");
        assertThat(r.writtenIn(turn("mauvais projet", null, null))).isEmpty();
    }

    @Test
    @DisplayName("deux projets écrits dans la demande : aucun, ni l'un ni l'autre")
    void two_written_projects_are_none() {
        assertThat(resolver().writtenIn(turn("de TF vers WEB", null, null))).isEmpty();
    }

    @Test
    @DisplayName("aucun projet dans l'espace : un geste le dit, sans question")
    void no_project_for_a_gesture() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of());

        ProjectResolver.Resolution r = new ProjectResolver(projectService).forGesture(null, "Test", turn("Crée une issue", null, null));

        assertThat(r.found()).isFalse();
        assertThat(r.problem()).contains("no project in this workspace");
    }

    @Test
    @DisplayName("aucun projet dans l'espace : le dit, sans choix à proposer")
    void no_project_at_all() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of());

        ProjectResolver.Resolution r = new ProjectResolver(projectService).resolve("TF", CTX);

        assertThat(r.found()).isFalse();
        assertThat(r.problem()).contains("no project in this workspace");
    }
}
