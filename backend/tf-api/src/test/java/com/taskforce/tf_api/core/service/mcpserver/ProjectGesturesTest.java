package com.taskforce.tf_api.core.service.mcpserver;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.CreateProjectRequest;
import com.taskforce.tf_api.core.dto.request.ProjectRepoLinkRequest;
import com.taskforce.tf_api.core.dto.response.ProjectRepoResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.service.ProjectRepoHost;
import com.taskforce.tf_api.core.service.ProjectRepoService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.Question;
import com.taskforce.tf_api.core.service.agent.QuestionNeeded;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Créer un projet, geste du MCP TaskForce (R115, séance n°17) : « crée un projet Next.js », l'exemple de la Présidence,
 * demande le nom, puis où vit son code, sa visibilité dans le même choix ; deux questions au plus, rien n'est créé avant.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Créer un projet depuis la conversation")
class ProjectGesturesTest {

    @Mock private ProjectService projectService;
    @Mock private ProjectRepoService repoService;
    @Mock private ProjectRepoHost repoHost;

    private final ObjectMapper json = new ObjectMapper();
    private ProjectGestures gestures;

    @BeforeEach
    void setUp() {
        gestures = new ProjectGestures(projectService, repoService, repoHost);
        lenient().when(repoHost.createsRepos("acme")).thenReturn(true);
        lenient().when(repoHost.linksRepos("acme")).thenReturn(true);
        lenient().when(repoHost.recentRepos("acme", 3)).thenReturn(List.of("acme/web"));
        lenient().when(projectService.createProject(eq("acme"), eq(7L), any())).thenAnswer(inv -> {
            CreateProjectRequest request = inv.getArgument(2);
            return ProjectResponse.builder().id(31L).identifier(request.getIdentifier()).name(request.getName()).build();
        });
    }

    private JsonNode args(String body) throws Exception {
        return json.readTree(body);
    }

    private Question asked(String body) {
        try {
            gestures.create("acme", 7L, args(body));
        } catch (QuestionNeeded needed) {
            return needed.question();
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        throw new AssertionError("no question for " + body);
    }

    /** Le nom manque, ou ne dit que la pile : TaskForce le demande, avant de rien créer. */
    @ParameterizedTest(name = "{0} : suggestion {1}")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
        "{}                                            | -",
        "{\"name\": \"Next.js\"}                       | Next.js app",
        "{\"name\": \"projet Next.js\", \"stack\": \"Next.js\"} | Next.js app",
        "{\"name\": \"Next.js app\", \"stack\": \"Next.js\"}    | Next.js app",
        "{\"stack\": \"Spring\"}                       | Spring app",
    })
    void a_missing_name_is_asked(String body, String suggestion) {
        Question question = asked(body);

        assertThat(question.field()).isEqualTo("name");
        assertThat(question.text()).isEqualTo("What should the project be called?");
        assertThat(question.choices()).extracting(Question.Choice::value)
            .containsExactlyElementsOf(suggestion == null ? List.of() : List.of(suggestion));
        assertThat(question.choices()).noneMatch(Question.Choice::recommended); // un nom n'a pas de défaut sûr
        verify(projectService, never()).createProject(any(), any(), any());
    }

    @Test
    @DisplayName("un projet de code demande où vit son code : un nouveau dépôt privé d'abord, un dépôt récent, ou aucun")
    void a_code_project_asks_where_its_code_lives() {
        Question question = asked("{\"name\": \"Atlas\", \"stack\": \"Next.js\"}");

        assertThat(question.field()).isEqualTo("repository");
        assertThat(question.text()).isEqualTo("Where does the code of Atlas live?");
        assertThat(question.choices()).extracting(Question.Choice::value)
            .containsExactly("new-private", "new-public", "acme/web", "none");
        assertThat(question.choices().get(0).recommended()).isTrue();
        assertThat(question.choices()).filteredOn(Question.Choice::recommended).hasSize(1);
        verify(projectService, never()).createProject(any(), any(), any());
    }

    /** Ce que TaskForce peut faire ici décide des choix : sans GitHub dans l'app desktop, pas de nouveau dépôt. */
    @ParameterizedTest(name = "crée {0}, lie {1} : {2}")
    @CsvSource(delimiter = '|', value = {
        "true  | false | new-private,new-public,none",
        "false | true  | acme/web,none",
    })
    void the_choices_are_what_taskforce_can_do_here(boolean creates, boolean links, String choices) {
        when(repoHost.createsRepos("acme")).thenReturn(creates);
        when(repoHost.linksRepos("acme")).thenReturn(links);

        assertThat(asked("{\"name\": \"Atlas\", \"stack\": \"Next.js\"}").choices()).extracting(Question.Choice::value)
            .containsExactly(choices.split(","));
    }

    @Test
    @DisplayName("sans GitHub, aucune question sur le dépôt : le projet se crée, et la réponse dit comment en donner un")
    void without_github_the_project_is_created_and_says_how() throws Exception {
        when(repoHost.createsRepos("acme")).thenReturn(false);
        when(repoHost.linksRepos("acme")).thenReturn(false);

        IssueGestures.Gesture done = gestures.create("acme", 7L, args("{\"name\": \"Atlas\", \"stack\": \"Next.js\"}"));

        assertThat(done.summary()).isEqualTo("Project created in TaskForce: ATLAS \"Atlas\" (id 31). To give it a repository, "
            + "connect GitHub in Settings > Integrations, then link one from the project's page.");
        verify(repoService, never()).linkRepo(any(), any(), any(), any());
    }

    /** Le dépôt choisi, et ce que TaskForce en fait : le créer (privé ou public), le lier, ou rien. */
    @ParameterizedTest(name = "dépôt {0} : {1}")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
        "\"new-private\"                                   | CREATE | true  | atlas    | Its new private repository acme/atlas is linked.",
        "\"new-public\"                                    | CREATE | false | atlas    | Its new public repository acme/atlas is linked.",
        "\"new\", \"repositoryVisibility\": \"privé\"      | CREATE | true  | atlas    | Its new private repository acme/atlas is linked.",
        "\"new\", \"repositoryVisibility\": \"public\"     | CREATE | false | atlas    | Its new public repository acme/atlas is linked.",
        "\"acme/web\"                                      | LINK   | true  | acme/web | Its repository acme/web is linked.",
    })
    void the_chosen_repository_is_created_or_linked(String repository, String mode, boolean isPrivate, String name,
                                                   String said) throws Exception {
        when(repoService.linkRepo(eq("acme"), eq(31L), eq(7L), any())).thenAnswer(inv -> {
            ProjectRepoLinkRequest request = inv.getArgument(3);
            return new ProjectRepoResponse(31L, "github",
                "CREATE".equals(request.getMode()) ? "acme/" + request.getRepoName() : request.getRepoFullName());
        });

        IssueGestures.Gesture done = gestures.create("acme", 7L,
            args("{\"name\": \"Atlas\", \"stack\": \"Next.js\", \"repository\": " + repository + "}"));

        ArgumentCaptor<ProjectRepoLinkRequest> request = ArgumentCaptor.forClass(ProjectRepoLinkRequest.class);
        verify(repoService).linkRepo(eq("acme"), eq(31L), eq(7L), request.capture());
        assertThat(request.getValue().getMode()).isEqualTo(mode);
        if ("CREATE".equals(mode)) {
            assertThat(request.getValue().getRepoName()).isEqualTo(name);
            assertThat(request.getValue().isPrivateRepo()).isEqualTo(isPrivate);
        } else {
            assertThat(request.getValue().getRepoFullName()).isEqualTo(name);
        }
        assertThat(done.summary()).isEqualTo("Project created in TaskForce: ATLAS \"Atlas\" (id 31). " + said);
        assertThat(done.undo()).containsEntry("projectId", 31L);
        assertThat(done.undo().containsKey("createdRepository")).isEqualTo("CREATE".equals(mode));
        assertThat(done.forClient()).doesNotContainKey("issue").containsKey("project");
    }

    @Test
    @DisplayName("un nouveau dépôt sans visibilité la demande : public, son code serait visible de tous")
    void a_new_repository_asks_its_visibility() {
        Question question = asked("{\"name\": \"Atlas\", \"repository\": \"new\"}");

        assertThat(question.field()).isEqualTo("repository");
        assertThat(question.choices()).extracting(Question.Choice::value).containsExactly("new-private", "new-public");
        assertThat(question.choices().get(0).recommended()).isTrue();
    }

    @ParameterizedTest(name = "« {0} » : aucun dépôt")
    @CsvSource({"none", "aucun", "No repository for now"})
    void no_repository_is_no_link(String answer) throws Exception {
        IssueGestures.Gesture done = gestures.create("acme", 7L,
            args("{\"name\": \"Atlas\", \"stack\": \"Next.js\", \"repository\": \"" + answer + "\"}"));

        assertThat(done.summary()).isEqualTo("Project created in TaskForce: ATLAS \"Atlas\" (id 31).");
        verify(repoService, never()).linkRepo(any(), any(), any(), any());
    }

    @Test
    @DisplayName("un projet qui n'est pas de code se crée d'emblée : le dépôt est facultatif, il ne se demande pas (R102)")
    void a_project_that_is_not_code_asks_nothing() throws Exception {
        IssueGestures.Gesture done = gestures.create("acme", 7L, args("{\"name\": \"Marketing Q4\", \"description\": \"Plan\"}"));

        assertThat(done.summary()).isEqualTo("Project created in TaskForce: MARKETINGQ \"Marketing Q4\" (id 31).");
        ArgumentCaptor<CreateProjectRequest> request = ArgumentCaptor.forClass(CreateProjectRequest.class);
        verify(projectService).createProject(eq("acme"), eq(7L), request.capture());
        assertThat(request.getValue().isPublic()).isFalse(); // visible de ses membres seulement : le défaut sûr
        assertThat(request.getValue().getDescription()).isEqualTo("Plan");
        verify(repoHost, never()).createsRepos(any());
    }

    @Test
    @DisplayName("un dépôt que GitHub refuse laisse le projet créé, et la réponse le dit")
    void a_refused_repository_leaves_the_project_and_says_so() throws Exception {
        when(repoService.linkRepo(eq("acme"), eq(31L), eq(7L), any()))
            .thenThrow(new BusinessException("GitHub refused to create the repository 'atlas'"));

        IssueGestures.Gesture done = gestures.create("acme", 7L,
            args("{\"name\": \"Atlas\", \"stack\": \"Next.js\", \"repository\": \"new-private\"}"));

        assertThat(done.summary()).isEqualTo("Project created in TaskForce: ATLAS \"Atlas\" (id 31). The repository was not "
            + "created: GitHub refused to create the repository 'atlas'. Link one from the project's page.");
        assertThat(done.undo()).doesNotContainKey("createdRepository");
    }

    @Test
    @DisplayName("une réponse qui n'est pas un dépôt se redemande, et une création impossible ici aussi")
    void an_answer_that_is_not_a_repository_is_asked_again() {
        assertThat(asked("{\"name\": \"Atlas\", \"stack\": \"Next.js\", \"repository\": \"the usual one\"}").text())
            .isEqualTo("\"the usual one\" isn't a repository: write it as owner/name. Where does the code of Atlas live?");
        when(repoHost.createsRepos("acme")).thenReturn(false);
        assertThat(asked("{\"name\": \"Atlas\", \"stack\": \"Next.js\", \"repository\": \"new\"}").text())
            .isEqualTo("TaskForce can't create a repository here. Where does the code of Atlas live?");
    }

    @ParameterizedTest(name = "« {0} » : dépôt {1}, clé {2}")
    @CsvSource({"Atlas Web, atlas-web, ATLASWEB", "Équipe Café, equipe-cafe, EQUIPECAFE", "A, a, PRJ",
        "Plateforme de données clients, plateforme-de-donnees-clients, PLATEFORME"})
    void the_repository_and_the_key_come_from_the_name(String name, String repo, String key) {
        assertThat(ProjectGestures.repoName(name)).isEqualTo(repo);
        assertThat(ProjectGestures.identifier(name)).isEqualTo(key);
    }
}
