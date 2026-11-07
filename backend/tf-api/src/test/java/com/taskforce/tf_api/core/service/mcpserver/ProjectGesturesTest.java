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
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Créer un projet, geste du MCP TaskForce (R115, séance n°17) : « crée un projet Next.js », l'exemple de la Présidence,
 * demande le nom et où vit son code dans la même carte, sa visibilité dans le même choix ; deux questions au plus, rien
 * n'est créé avant.
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
        lenient().when(repoHost.recentRepos(eq("acme"), anyInt())).thenReturn(List.of("acme/web", "acme/api", "acme/site"));
        lenient().when(projectService.createProject(eq("acme"), eq(7L), any())).thenAnswer(inv -> {
            CreateProjectRequest request = inv.getArgument(2);
            return ProjectResponse.builder().id(31L).identifier(request.getIdentifier()).name(request.getName()).build();
        });
    }

    private JsonNode args(String body) throws Exception {
        return json.readTree(body);
    }

    private Question asked(String body) {
        return card(body).get(0);
    }

    /** La carte que le geste lève sur ces arguments : ses questions, dans l'ordre où la personne les lit. */
    private List<Question> card(String body) {
        try {
            gestures.create("acme", 7L, args(body));
        } catch (QuestionNeeded needed) {
            return needed.questions();
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        throw new AssertionError("no question for " + body);
    }

    /**
     * Ce qui manque se demande dans une seule carte, deux questions au plus (décision du CEO, 05/11/2026) : « crée un
     * projet Next.js » demande le nom et où vit son code d'un coup. Cortex lit les mêmes questions avant le geste, et rien
     * n'est créé avant leurs réponses.
     */
    @ParameterizedTest(name = "{0} : {1}")
    @CsvSource(delimiter = '|', value = {
        "{}                                              | Name: What should the project be called?",
        "{\"stack\": \"Next.js\"}                        | Name: What should the project be called?~Repository: Where does its code live?",
        "{\"name\": \"Next.js\"}                         | Name: What should the project be called?~Repository: Where does its code live?",
        "{\"stack\": \"Next.js\", \"repository\": \"new\"} | Name: What should the project be called?~Visibility: Who can see the new repository?",
        "{\"name\": \"Atlas\", \"stack\": \"Next.js\"}   | Repository: Where does the code of Atlas live?",
        "{\"name\": \"Atlas\", \"repository\": \"new\"}  | Visibility: Who can see the new repository of Atlas?",
    })
    void what_is_missing_is_asked_in_one_card(String body, String asked) throws Exception {
        List<Question> card = card(body);

        assertThat(card).extracting(question -> question.header() + ": " + question.text())
            .containsExactly(asked.split("~"));
        assertThat(gestures.questions("acme", args(body))).isEqualTo(card);
        assertThat(card).noneMatch(Question::multiple); // un nom, un dépôt : une seule réponse chacun
        verify(projectService, never()).createProject(any(), any(), any());
        verify(repoService, never()).linkRepo(any(), any(), any(), any());
    }

    @Test
    @DisplayName("chaque choix se dit en une ligne, le dépôt privé recommandé en premier, quatre choix au plus")
    void each_choice_says_what_it_means() {
        List<Question> card = card("{\"stack\": \"Next.js\"}");

        assertThat(card.get(0).choices()).singleElement().satisfies(choice -> {
            assertThat(choice.value()).isEqualTo("Next.js app");
            assertThat(choice.description()).isEqualTo("Suggested from your request");
            assertThat(choice.recommended()).isFalse(); // un nom n'a pas de défaut sûr
        });
        Question repository = card.get(1);
        assertThat(repository.choices()).hasSize(Question.MAX_CHOICES).allMatch(choice -> choice.description() != null);
        assertThat(repository.choices()).extracting(Question.Choice::label)
            .containsExactly("A new private repository", "A new public repository", "acme/web", "No repository for now");
        assertThat(repository.choices()).filteredOn(Question.Choice::recommended).extracting(Question.Choice::value)
            .containsExactly("new-private");
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
        "false | true  | acme/web,acme/api,acme/site,none",
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
    @DisplayName("une réponse qui ne nomme aucun de ses dépôts propose les plus proches une fois, puis le projet se crée sans")
    void an_answer_that_names_no_repository_offers_the_closest_once() throws Exception {
        Question closest = asked("{\"name\": \"Atlas\", \"stack\": \"Next.js\", \"repository\": \"the usual one\", "
            + "\"answered\": [\"repository\"]}");
        assertThat(closest.text()).isEqualTo("None of your repositories is called \"the usual one\": is it one of these?");
        assertThat(closest.choices()).extracting(Question.Choice::value)
            .containsExactly("acme/web", "acme/api", "acme/site", "none");

        // La carte des plus proches a déjà été montrée : elle ne revient pas, le projet se crée sans dépôt et le dit.
        IssueGestures.Gesture done = gestures.create("acme", 7L, args("{\"name\": \"Atlas\", \"stack\": \"Next.js\", "
            + "\"repository\": \"the usual one\", \"answered\": [\"name\", \"repository\", \"repository\"]}"));
        assertThat(done.summary()).isEqualTo("Project created in TaskForce: ATLAS \"Atlas\" (id 31). No repository is "
            + "linked: \"the usual one\" isn't one of your repositories. Link it from the page of Atlas.");
        verify(repoService, never()).linkRepo(any(), any(), any(), any());

        when(repoHost.createsRepos("acme")).thenReturn(false);
        assertThat(asked("{\"name\": \"Atlas\", \"stack\": \"Next.js\", \"repository\": \"new\"}").text())
            .isEqualTo("TaskForce can't create a repository here. Where does the code of Atlas live?");
    }

    /**
     * GitHub connecté mais qui ne liste rien (son jeton refusé, la pile de dev le 05/11/2026) : la réponse tapée ne se lit
     * parmi rien. La carte le dit une fois, puis le projet se crée sans dépôt, et la réponse dit pourquoi.
     */
    @Test
    @DisplayName("ses dépôts illisibles : une carte qui le dit, une fois, puis le projet sans dépôt")
    void unreadable_repositories_are_said_once() throws Exception {
        when(repoHost.recentRepos(eq("acme"), anyInt())).thenReturn(List.of());
        String body = "{\"name\": \"Next.js app\", \"stack\": \"Next.js\", \"repository\": \"test-taskforce est un repo "
            + "normalement nan ?\", \"answered\": [\"name\", \"repository\"";

        Question card = asked(body + "]}");
        assertThat(card.text()).isEqualTo("TaskForce can't see your repositories here: write it as owner/name, or go on "
            + "without one.");
        assertThat(card.choices()).extracting(Question.Choice::value).containsExactly("none");

        IssueGestures.Gesture done = gestures.create("acme", 7L, args(body + ", \"repository\"]}"));
        assertThat(done.summary()).isEqualTo("Project created in TaskForce: NEXTJSAPP \"Next.js app\" (id 31). No "
            + "repository is linked: TaskForce can't see your repositories here. Link it from the page of Next.js app.");
        verify(repoService, never()).linkRepo(any(), any(), any(), any());
    }

    /**
     * Test du CEO du 05/11/2026 sur l'app desktop : sa réponse tapée nommait son dépôt sans son propriétaire, dans une
     * phrase, et la carte revenait. Une réponse tapée se lit parmi ses dépôts, sans la casse, les espaces, les tirets ni le
     * propriétaire ; un seul, c'est lui.
     */
    @ParameterizedTest(name = "« {0} » : {1}")
    @CsvSource(delimiter = '|', value = {
        "test-taskforce est un repo normalement nan ?     | Miche1-Pierre/test-taskforce",
        "test taskforce est un repo regarde bien          | Miche1-Pierre/test-taskforce",
        "TEST_TASKFORCE                                   | Miche1-Pierre/test-taskforce",
        "miche1-pierre/TEST-taskforce                     | Miche1-Pierre/test-taskforce",
        "c'est Miche1-Pierre/test-taskforce               | Miche1-Pierre/test-taskforce",
        "le repo test                                     | Miche1-Pierre/test",
    })
    void a_typed_answer_is_read_among_the_repositories(String answer, String linked) throws Exception {
        when(repoHost.recentRepos(eq("acme"), anyInt()))
            .thenReturn(List.of("Miche1-Pierre/site", "Miche1-Pierre/test-taskforce", "Miche1-Pierre/test"));
        when(repoService.linkRepo(eq("acme"), eq(31L), eq(7L), any()))
            .thenAnswer(inv -> new ProjectRepoResponse(31L, "github", ((ProjectRepoLinkRequest) inv.getArgument(3)).getRepoFullName()));

        IssueGestures.Gesture done = gestures.create("acme", 7L, args("{\"name\": \"Atlas\", \"stack\": \"Next.js\", "
            + "\"repository\": \"" + answer + "\", \"answered\": [\"repository\"]}"));

        ArgumentCaptor<ProjectRepoLinkRequest> request = ArgumentCaptor.forClass(ProjectRepoLinkRequest.class);
        verify(repoService).linkRepo(eq("acme"), eq(31L), eq(7L), request.capture());
        assertThat(request.getValue().getMode()).isEqualTo("LINK");
        assertThat(request.getValue().getRepoFullName()).isEqualTo(linked);
        assertThat(done.summary()).endsWith("Its repository " + linked + " is linked.");
    }

    @Test
    @DisplayName("une réponse qui nomme plusieurs dépôts les propose, eux seuls, avec une phrase")
    void an_answer_that_names_several_repositories_offers_them() {
        when(repoHost.recentRepos(eq("acme"), anyInt())).thenReturn(List.of("acme/site", "acme/api", "perso/site"));

        Question question = asked("{\"name\": \"Atlas\", \"stack\": \"Next.js\", \"repository\": \"site\"}");

        assertThat(question.text()).isEqualTo("Several of your repositories match \"site\": which one is it?");
        assertThat(question.choices()).extracting(Question.Choice::value).containsExactly("acme/site", "perso/site", "none");
    }

    /**
     * Test du CEO du 05/11/2026 : « Next.js app », que TaskForce proposait, se redemandait une fois choisi. Une réponse
     * donnée ne se redemande jamais, même quand elle ne dit que la pile ; le modèle, lui, ne nomme pas un projet ainsi.
     */
    @ParameterizedTest(name = "nom « {0} », répondu {1} : demandé {2}")
    @CsvSource(delimiter = '|', value = {
        "Next.js app | true  | false",
        "Next.js     | true  | false",
        "Next.js app | false | true",
    })
    void an_answered_name_is_never_asked_again(String name, boolean answered, boolean asked) throws Exception {
        String body = "{\"name\": \"" + name + "\", \"stack\": \"Next.js\", \"repository\": \"none\""
            + (answered ? ", \"answered\": [\"name\", \"repository\"]" : "") + "}";

        assertThat(gestures.questions("acme", args(body))).extracting(Question::field)
            .containsExactlyElementsOf(asked ? List.of("name") : List.of());
        if (!asked) {
            assertThat(gestures.create("acme", 7L, args(body)).summary())
                .startsWith("Project created in TaskForce: NEXTJS");
        }
    }

    /**
     * L'échange du CEO, rejoué : la carte de « crée un projet Next.js », puis ses réponses (le nom proposé, son dépôt dans
     * une phrase) : le projet se crée avec son dépôt, sans que la carte revienne.
     */
    @Test
    @DisplayName("l'échange du CEO : la carte une fois, puis le projet et son dépôt")
    void the_ceo_exchange_creates_the_project_with_its_repository() throws Exception {
        when(repoHost.createsRepos("acme")).thenReturn(false); // l'app desktop : la coque crée les dépôts
        when(repoHost.recentRepos(eq("acme"), anyInt()))
            .thenReturn(List.of("Miche1-Pierre/portfolio", "Miche1-Pierre/test-taskforce", "Miche1-Pierre/notes"));
        when(repoService.linkRepo(eq("acme"), eq(31L), eq(7L), any()))
            .thenAnswer(inv -> new ProjectRepoResponse(31L, "github", ((ProjectRepoLinkRequest) inv.getArgument(3)).getRepoFullName()));

        List<Question> card = gestures.questions("acme", args("{\"stack\": \"Next.js\"}"), "crée un projet Next.js");
        assertThat(card).extracting(Question::field).containsExactly("name", "repository");
        assertThat(card.get(1).choices()).extracting(Question.Choice::value)
            .containsExactly("Miche1-Pierre/portfolio", "Miche1-Pierre/test-taskforce", "Miche1-Pierre/notes", "none");

        IssueGestures.Gesture done = gestures.create("acme", 7L, args("{\"stack\": \"Next.js\", \"name\": \"Next.js app\", "
            + "\"repository\": \"test-taskforce est un repo normalement nan ?\", \"answered\": [\"name\", \"repository\"]}"));

        assertThat(done.summary()).isEqualTo("Project created in TaskForce: NEXTJSAPP \"Next.js app\" (id 31). Its "
            + "repository Miche1-Pierre/test-taskforce is linked.");
    }

    /**
     * Les dépôts de la personne, les plus proches du nom du projet d'abord, puis les plus récemment actifs ; un dépôt qui
     * porte déjà le nom du projet vient en tête, recommandé.
     */
    @ParameterizedTest(name = "« {0} », crée {1} : {2}")
    @CsvSource(delimiter = '|', value = {
        "Orion          | false | acme/orion-docs,acme/orion-web,acme/api,none",
        "Orion Web      | false | acme/orion-web*,acme/orion-docs,acme/api,none",
        "Orion Web      | true  | acme/orion-web*,new-private,new-public,none",
        "Atlas          | true  | new-private*,new-public,acme/api,none",
    })
    void the_closest_repositories_come_first(String name, boolean creates, String choices) {
        when(repoHost.createsRepos("acme")).thenReturn(creates);
        when(repoHost.recentRepos(eq("acme"), anyInt()))
            .thenReturn(List.of("acme/api", "acme/site", "acme/orion-docs", "acme/orion-web"));

        Question question = asked("{\"name\": \"" + name + "\", \"stack\": \"Next.js\"}");

        assertThat(question.choices()).extracting(c -> c.value() + (c.recommended() ? "*" : ""))
            .containsExactly(choices.split(","));
    }

    @Test
    @DisplayName("sans GitHub ici, un dépôt nommé ne se lie pas : le projet se crée, et la réponse dit comment en donner un")
    void without_github_a_named_repository_is_not_asked_again() throws Exception {
        when(repoHost.createsRepos("acme")).thenReturn(false);
        when(repoHost.linksRepos("acme")).thenReturn(false);

        IssueGestures.Gesture done = gestures.create("acme", 7L,
            args("{\"name\": \"Atlas\", \"stack\": \"Next.js\", \"repository\": \"acme/web\"}"));

        assertThat(done.summary()).isEqualTo("Project created in TaskForce: ATLAS \"Atlas\" (id 31). TaskForce can't link a "
            + "repository here: connect GitHub in Settings > Integrations, then link one from the project's page.");
        verify(repoService, never()).linkRepo(any(), any(), any(), any());
    }

    @ParameterizedTest(name = "« {0} » : dépôt {1}, clé {2}")
    @CsvSource({"Atlas Web, atlas-web, ATLASWEB", "Équipe Café, equipe-cafe, EQUIPECAFE", "A, a, PRJ",
        "Plateforme de données clients, plateforme-de-donnees-clients, PLATEFORME"})
    void the_repository_and_the_key_come_from_the_name(String name, String repo, String key) {
        assertThat(ProjectGestures.repoName(name)).isEqualTo(repo);
        assertThat(ProjectGestures.identifier(name)).isEqualTo(key);
    }
}
