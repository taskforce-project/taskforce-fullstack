package com.taskforce.tf_api.core.service.mcpserver;

import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalString;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.taskforce.tf_api.core.dto.request.CreateProjectRequest;
import com.taskforce.tf_api.core.dto.request.ProjectRepoLinkRequest;
import com.taskforce.tf_api.core.dto.response.ProjectRepoResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.service.GitHubRepoNames;
import com.taskforce.tf_api.core.service.ProjectRepoHost;
import com.taskforce.tf_api.core.service.ProjectRepoService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.Question;
import com.taskforce.tf_api.core.service.agent.QuestionNeeded;
import com.taskforce.tf_api.core.service.agent.tools.IssueFields;
import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Créer un projet, geste du MCP TaskForce (ADR-024, R115) : le même pour Cortex dans la conversation et pour un agent
 * extérieur, avec les droits de la personne, par les services des routes REST ({@code POST /projects}, puis
 * {@code PUT /projects/{id}/repo}).
 *
 * <p>Ce qu'il exige, TaskForce le demande dans une seule carte, deux questions au plus pour une demande courante (le
 * signal d'arrêt de R115 ; décision du CEO, 05/11/2026 : « deux questions au plus », comme sur Claude) ; « crée un
 * projet Next.js », l'exemple de la Présidence, demande les deux d'un coup :</p>
 * <ol>
 *   <li><b>le nom</b>, quand la demande n'en donne pas, ou ne dit que ce sur quoi le projet est construit (« Next.js »
 *       est une pile, pas un nom) ;</li>
 *   <li><b>où vit son code</b>, pour un projet de code (une pile nommée) : un nouveau dépôt, privé, au nom du projet, puis
 *       lié (TF-J1-15 : le clic sur la carte est l'accord), un dépôt qui existe, ou aucun pour l'instant. Un nouveau dépôt
 *       n'est proposé que là où il peut vraiment se créer : le GitHub connecté à l'espace, le {@code gh} de la personne
 *       dans l'app desktop (R15) ; sans GitHub, aucune question, et la réponse dit comment en donner un.</li>
 * </ol>
 * <p>Cortex lit ces questions avant le geste ({@link #questions}), avec ce que le modèle a mis à la place des mots de la
 * personne ; un agent extérieur les reçoit du geste lui-même.</p>
 * <p>Le reste a un défaut sûr et ne se demande jamais : la clé du projet vient de son nom, et le projet n'est visible
 * que de ses membres. Tout se juge avant d'écrire ; un dépôt refusé par GitHub laisse le projet créé, et la réponse le
 * dit.</p>
 * <p>Une réponse donnée ne se redemande jamais (test du CEO du 05/11/2026, sur l'app desktop : la même carte revenait
 * sur « test-taskforce est un repo normalement nan ? », puis le nom « Next.js app », que TaskForce proposait lui-même,
 * se redemandait). Les dépôts proposés sont ceux de la personne, les plus proches du nom et de la demande d'abord ; une
 * réponse tapée se lit parmi eux ({@link RepoMatch}) ; quand elle n'en nomme pas un seul, les plus proches se proposent
 * une fois, puis le projet se crée sans dépôt, et la réponse dit pourquoi.</p>
 */
@Component
public class ProjectGestures {

    /** Ce que la conversation propose pour le dépôt d'un projet de code, et ce qu'un agent peut passer. */
    static final String NEW = "new";
    static final String NEW_PRIVATE = "new-private";
    static final String NEW_PUBLIC = "new-public";
    static final String NONE = "none";
    private static final String LINK = "LINK";
    private static final String CREATE_NEW = "Create a new repository";
    private static final String REPOSITORY = "repository";

    /** Les dépôts lus pour la question : GitHub en rend cent au plus, les plus récemment actifs d'abord. */
    static final int REPOSITORIES = 100;
    /** Le temps d'une carte et de sa réponse : les dépôts ne se relisent pas à chaque question. */
    private static final Duration REPOSITORIES_KEPT = Duration.ofSeconds(60);

    /**
     * Les piles qu'une demande nomme à la place d'un nom (« crée un projet Next.js »), lues par {@link IssueFields#key} :
     * un nom qui n'est qu'une d'elles ne nomme pas le projet, il dit sur quoi il est construit.
     */
    static final Set<String> STACKS = Set.of("nextjs", "next", "react", "reactnative", "vue", "vuejs", "nuxt", "nuxtjs",
        "angular", "svelte", "sveltekit", "astro", "remix", "gatsby", "node", "nodejs", "express", "nestjs", "django",
        "flask", "fastapi", "rails", "rubyonrails", "laravel", "symfony", "spring", "springboot", "java", "kotlin", "swift",
        "swiftui", "flutter", "expo", "electron", "tauri", "dotnet", "net", "aspnet", "go", "golang", "rust", "python",
        "typescript", "javascript", "php", "ruby", "android", "ios");

    /** Les mots qui accompagnent une pile sans nommer le projet : « un projet Next.js », « Next.js app ». */
    private static final Set<String> FILLERS = Set.of("project", "projet", "app", "application", "the", "a", "an", "un",
        "une", "le", "la", "new", "nouveau", "nouvelle", "my", "mon", "ma");

    private static final Set<String> NO_REPOSITORY = Set.of("none", "no", "non", "aucun", "aucune", "sans", "later",
        "nope", "pasdedepot", "norepository", "norepositoryfornow", "rien", "norepo", "pasderepo", "sansrepo",
        "aucunrepo", "sansdepot", "aucundepot", "nothing", "skip", "plustard", "pasmaintenant");
    private static final Set<String> PRIVATE = Set.of("private", "prive", "privee", "privé", "privée");
    private static final Set<String> PUBLIC = Set.of("public", "publique");

    private final ProjectService projectService;
    private final ProjectRepoService repoService;
    private final ProjectRepoHost repoHost;
    /** Les dépôts de chaque espace, lus il y a moins de {@link #REPOSITORIES_KEPT}. */
    private final Map<String, Read> repositories = new ConcurrentHashMap<>();

    private record Read(List<String> repos, long at) {}

    public ProjectGestures(ProjectService projectService, ProjectRepoService repoService, ProjectRepoHost repoHost) {
        this.projectService = projectService;
        this.repoService = repoService;
        this.repoHost = repoHost;
    }

    /**
     * Le dépôt choisi : aucun, un nouveau (et sa visibilité), ou un existant ({@code owner/name}). {@code note} : pourquoi
     * il n'y en a pas, quand la personne en a nommé un que TaskForce n'a pas trouvé.
     */
    record Repository(String mode, boolean isPrivate, String fullName, String note) {
        static final Repository NONE_YET = new Repository(null, true, null, null);

        static Repository none(String note) {
            return new Repository(null, true, null, note);
        }

        static Repository linked(String fullName) {
            return new Repository(LINK, true, fullName, null);
        }

        static Repository created(boolean isPrivate) {
            return new Repository(NEW, isPrivate, null, null);
        }

        boolean none() {
            return mode == null;
        }
    }

    /**
     * Ce que la demande dit du projet : son nom (vide quand elle ne dit que sa pile), sur quoi il est construit, son
     * dépôt et la visibilité d'un nouveau dépôt, et les questions auxquelles la personne a déjà répondu
     * ({@link Question#ANSWERED}, une fois par réponse).
     */
    private record Wanted(String name, String stack, String repository, String visibility, List<String> answered) {

        /** Combien de fois la personne a répondu à cette question. */
        long answers(String field) {
            return answered.stream().filter(field::equals).count();
        }
    }

    private static Wanted wanted(JsonNode args) {
        List<String> answered = answered(args);
        String stack = text(optionalString(args, "stack", 60));
        String name = text(optionalString(args, "name", 150));
        // Un nom que la personne a donné sur la carte est le sien, même quand il ne dit que la pile (« Next.js app », que
        // TaskForce proposait lui-même) : il ne se redemande pas.
        if (!answered.contains("name")) {
            if (stack.isEmpty() && STACKS.contains(IssueFields.key(withoutFillers(name)))) {
                stack = name;
                name = "";
            } else if (!stack.isEmpty() && onlyStack(name, stack)) {
                name = "";
            }
        }
        return new Wanted(name, stack, text(optionalString(args, REPOSITORY, 200)),
            text(optionalString(args, "repositoryVisibility", 20)), answered);
    }

    /** Les questions auxquelles la personne a répondu sur les cartes de TaskForce, notées par le serveur. */
    static List<String> answered(JsonNode args) {
        JsonNode marked = args == null ? null : args.get(Question.ANSWERED);
        if (marked == null || !marked.isArray()) return List.of();
        List<String> fields = new ArrayList<>();
        marked.forEach(field -> {
            if (field.isTextual()) fields.add(field.asText());
        });
        return fields;
    }

    /**
     * Ce que TaskForce demande avant de créer le projet, dans une seule carte : le nom qui manque, puis où vit son code.
     * Une lecture : rien n'est créé. Vide quand rien ne manque.
     */
    public List<Question> questions(String slug, JsonNode args) {
        return questions(slug, args, null);
    }

    /**
     * La même carte, les dépôts rangés par ce que dit aussi la demande de la personne ({@code request}, null sans demande
     * à relire).
     */
    public List<Question> questions(String slug, JsonNode args, String request) {
        Wanted wanted = wanted(args);
        List<Question> asked = new ArrayList<>();
        if (wanted.name().isEmpty()) {
            String suggested = wanted.stack() + " app";
            asked.add(Question.of("name", "Name", "What should the project be called?", wanted.stack().isEmpty() ? List.of()
                : List.of(Question.Choice.of(suggested, suggested, "Suggested from your request"))));
        }
        try {
            repository(slug, wanted, request);
        } catch (QuestionNeeded needed) {
            asked.addAll(needed.questions());
        }
        return asked;
    }

    /**
     * Crée le projet, et son dépôt quand c'en est un de code. Une question levée ({@link QuestionNeeded}) ne crée rien :
     * le nom et le dépôt qui manquent, dans la même carte. La phrase commence comme celle de l'ancien outil de Cortex :
     * « Project created in TaskForce: KEY "nom" (id N). ».
     */
    public IssueGestures.Gesture create(String slug, Long userId, JsonNode args) {
        List<Question> asked = questions(slug, args);
        if (!asked.isEmpty()) throw new QuestionNeeded(asked);
        Wanted wanted = wanted(args);
        String name = wanted.name();
        Repository repository = repository(slug, wanted, null);

        CreateProjectRequest request = new CreateProjectRequest();
        request.setName(name);
        String identifier = text(optionalString(args, "identifier", 10));
        request.setIdentifier(identifier.isEmpty() ? identifier(name) : identifier.toUpperCase(Locale.ROOT));
        String description = text(optionalString(args, "description", 1000));
        if (!description.isEmpty()) request.setDescription(description);
        ProjectResponse project = projectService.createProject(slug, userId, request);

        StringBuilder said = new StringBuilder("Project created in TaskForce: ").append(project.getIdentifier())
            .append(" \"").append(project.getName()).append("\" (id ").append(project.getId()).append(").");
        String linked = null;
        if (!repository.none()) {
            try {
                ProjectRepoResponse repo = repoService.linkRepo(slug, project.getId(), userId, linkRequest(repository, name));
                linked = repo.repoFullName();
                said.append(NEW.equals(repository.mode())
                    ? " Its new " + (repository.isPrivate() ? "private" : "public") + " repository " + linked + " is linked."
                    : " Its repository " + linked + " is linked.");
            } catch (BusinessException e) {
                said.append(" The repository was not ").append(NEW.equals(repository.mode()) ? "created" : "linked")
                    .append(": ").append(e.getMessage()).append(". Link one from the project's page.");
            }
        } else if (repository.note() != null) {
            said.append(' ').append(repository.note());
        } else if (!wanted.stack().isEmpty() && !repoHost.createsRepos(slug) && !repoHost.linksRepos(slug)) {
            said.append(" To give it a repository, connect GitHub in Settings > Integrations, then link one from the "
                + "project's page.");
        }

        Map<String, Object> detail = new LinkedHashMap<>();
        Map<String, Object> created = new LinkedHashMap<>();
        created.put("id", project.getId());
        created.put("key", project.getIdentifier());
        created.put("name", project.getName());
        if (linked != null) created.put("repository", linked);
        detail.put("project", created);
        Map<String, Object> undo = new LinkedHashMap<>();
        undo.put("projectId", project.getId());
        undo.put("key", project.getIdentifier());
        if (linked != null && NEW.equals(repository.mode())) undo.put("createdRepository", linked);
        return new IssueGestures.Gesture(said.toString(), null, List.of(), detail, undo);
    }

    /**
     * Où vit le code du projet. Pour un projet de code dont la demande ne le dit pas, TaskForce demande, avec ce qu'il
     * peut faire ici : un nouveau dépôt (privé d'abord), les dépôts de la personne les plus proches du nom et de la
     * demande, ou aucun. Une réponse tapée se lit parmi ses dépôts, sans la casse, les espaces, les tirets ni le
     * propriétaire : un seul, c'est lui ; plusieurs ou aucun, les plus proches se proposent une fois, avec une phrase,
     * puis le projet se crée sans dépôt, et la réponse dit pourquoi. Un nouveau dépôt dont la visibilité n'est pas dite se
     * demande aussi : public, son code serait visible de tous, et cela ne se défait pas d'ici. Le nom peut manquer
     * encore : la question dit alors « son code ».
     */
    Repository repository(String slug, Wanted wanted, String request) {
        String asked = wanted.repository();
        String code = wanted.name().isEmpty() ? "its code" : "the code of " + wanted.name();
        String said = IssueFields.key(asked);
        // Un projet qui n'est pas de code, sans dépôt nommé : rien à demander, ni à l'hôte des dépôts (R102).
        if (asked.isEmpty() && wanted.stack().isEmpty()) return Repository.NONE_YET;
        if (NO_REPOSITORY.contains(said)) return Repository.NONE_YET;
        boolean brandNew = NEW.equals(said) || IssueFields.key(NEW_PRIVATE).equals(said) || IssueFields.key(NEW_PUBLIC).equals(said);
        // Un nouveau dépôt ne se crée que si la personne le dit. Quand seul le modèle le dit (qwen3:8b le 09/11/2026, pour
        // « Crée un projet "Recette 113" »), la carte le propose, et son clic est l'accord.
        if (brandNew && (request == null || RepoMatch.namesRepository(request))) {
            return created(slug, wanted, said, code);
        }
        boolean creates = repoHost.createsRepos(slug);
        boolean links = repoHost.linksRepos(slug);
        if (asked.isEmpty() || brandNew) {
            if (!creates && !links) return Repository.NONE_YET;
            List<String> mine = links ? repositories(slug) : List.of();
            throw new QuestionNeeded(whereItLives(creates, mine, wanted, request, "Where does " + code + " live?"));
        }
        if (!links) {
            // Rien ne se lie ici : le projet se crée, et la réponse dit comment lui en donner un (jamais la même carte).
            return creates && RepoMatch.wantsNew(asked) ? created(slug, wanted, said, code)
                : Repository.none("No repository can be linked from here: connect GitHub in Settings > Integrations, "
                    + "then link one from the project's page.");
        }
        List<String> mine = repositories(slug);
        if (GitHubRepoNames.isFullName(asked)) {
            return Repository.linked(mine.stream().filter(asked::equalsIgnoreCase).findFirst().orElse(asked));
        }
        List<String> matching = RepoMatch.matching(asked, mine);
        if (matching.size() == 1) return Repository.linked(matching.get(0));
        if (matching.isEmpty() && creates && RepoMatch.wantsNew(asked)) return created(slug, wanted, said, code);
        String project = wanted.name().isEmpty() ? "the project" : wanted.name();
        if (wanted.answers(REPOSITORY) > 1) {
            // Les plus proches ont déjà été proposés : la carte ne revient pas, le projet se crée sans dépôt.
            String why = mine.isEmpty() ? "your repositories can't be read from here"
                : "\"" + clip(asked) + "\"" + (matching.isEmpty() ? " isn't one of your repositories"
                    : " matches several of your repositories");
            return Repository.none("No repository is linked: " + why + ". Link it from the page of " + project + ".");
        }
        throw new QuestionNeeded(closest(asked, matching, mine));
    }

    /**
     * Un nouveau dépôt : privé ou public selon ce qui est dit ; sinon sa visibilité se demande. Là où TaskForce n'en crée
     * pas, la question du dépôt le dit, avec les dépôts de la personne.
     */
    private Repository created(String slug, Wanted wanted, String said, String code) {
        if (!repoHost.createsRepos(slug)) {
            List<String> mine = repoHost.linksRepos(slug) ? repositories(slug) : List.of();
            if (wanted.answers(REPOSITORY) > 1) {
                return Repository.none("A repository can't be created from here: create one from the project's page.");
            }
            throw new QuestionNeeded(whereItLives(false, mine, wanted, null,
                "A new repository can't be created from here. Where does " + code + " live?"));
        }
        if (IssueFields.key(NEW_PRIVATE).equals(said)) return Repository.created(true);
        if (IssueFields.key(NEW_PUBLIC).equals(said)) return Repository.created(false);
        String seen = IssueFields.key(wanted.visibility());
        if (PRIVATE.contains(seen) || PRIVATE.contains(wanted.visibility().toLowerCase(Locale.ROOT))) {
            return Repository.created(true);
        }
        if (PUBLIC.contains(seen)) return Repository.created(false);
        String typed = RepoMatch.visibility(wanted.repository());
        if (typed != null) return Repository.created("private".equals(typed));
        throw new QuestionNeeded(Question.of(REPOSITORY, "Visibility", "Who can see the new repository"
            + (wanted.name().isEmpty() ? "" : " of " + wanted.name()) + "?", List.of(
                Question.Choice.recommended(NEW_PRIVATE, "Private", "Only the people you add see its code"),
                Question.Choice.of(NEW_PUBLIC, "Public", "Anyone on the internet sees its code"))));
    }

    /**
     * La question du dépôt : ce qui peut se faire ici, le nouveau dépôt recommandé (privé, au nom du projet) ; les dépôts de la
     * personne prennent la place qui reste sur la carte, à côté d'aucun, ceux qui ressemblent au nom, à la pile ou à la
     * demande d'abord, puis les plus récemment actifs. Un dépôt qui porte déjà le nom du projet vient en tête, recommandé :
     * un nouveau dépôt de ce nom ne pourrait pas se créer.
     */
    private Question whereItLives(boolean creates, List<String> mine, Wanted wanted, String request, String text) {
        List<Question.Choice> choices = new ArrayList<>();
        String same = wanted.name().isEmpty() ? null : RepoMatch.named(wanted.name(), mine);
        if (same != null) {
            choices.add(Question.Choice.recommended(same, same, "Your repository with this project's name, linked as it is"));
        }
        if (creates) {
            String named = wanted.name().isEmpty() ? "named after the project" : "named " + repoName(wanted.name());
            Question.Choice fresh = Question.Choice.of(NEW_PRIVATE, CREATE_NEW, "Private, " + named + ", and linked to this project");
            choices.add(same == null ? Question.Choice.recommended(fresh.value(), fresh.label(), fresh.description()) : fresh);
        }
        int room = Question.MAX_CHOICES - choices.size() - 1;
        RepoMatch.ranked(mine, Arrays.asList(wanted.name(), wanted.stack(), request)).stream()
            .filter(repo -> !repo.equals(same))
            .limit(Math.max(room, 0))
            .forEach(repo -> choices.add(Question.Choice.of(repo, repo, "An existing repository, linked as it is")));
        choices.add(Question.Choice.of(NONE, "No repository for now", "Link one later from the project's page"));
        return Question.of(REPOSITORY, "Repository", text, choices);
    }

    /**
     * Une réponse tapée qui ne nomme pas un seul de ses dépôts : une phrase, puis ceux qu'elle nomme, ou les plus proches
     * de ce qu'elle a écrit, et aucun. Cette carte ne se montre qu'une fois.
     */
    private static Question closest(String asked, List<String> matching, List<String> mine) {
        int room = Question.MAX_CHOICES - 1;
        String text;
        List<String> offered;
        if (!matching.isEmpty()) {
            text = "Several of your repositories match \"" + clip(asked) + "\": which one is it?";
            offered = matching.stream().limit(room).toList();
        } else if (mine.isEmpty()) {
            text = "I can't see your repositories here: write it as owner/name, or go on without one.";
            offered = List.of();
        } else {
            text = "None of your repositories is called \"" + clip(asked) + "\": is it one of these?";
            offered = RepoMatch.closest(asked, mine, room);
        }
        List<Question.Choice> choices = new ArrayList<>();
        offered.forEach(repo -> choices.add(Question.Choice.of(repo, repo, "An existing repository, linked as it is")));
        choices.add(Question.Choice.of(NONE, "No repository for now", "Link one later from the project's page"));
        return Question.of(REPOSITORY, "Repository", text, choices);
    }

    /**
     * Les dépôts de la personne, du plus récemment actif au plus ancien, gardés le temps d'une carte et de sa réponse ; vide
     * quand l'hôte ne les connaît pas (GitHub non connecté, injoignable).
     */
    private List<String> repositories(String slug) {
        long now = System.nanoTime();
        Read kept = repositories.get(slug);
        if (kept != null && now - kept.at() < REPOSITORIES_KEPT.toNanos()) return kept.repos();
        List<String> read;
        try {
            read = repoHost.recentRepos(slug, REPOSITORIES).stream().filter(GitHubRepoNames::isFullName).toList();
        } catch (RuntimeException unreadable) {
            read = List.of();
        }
        if (!read.isEmpty()) repositories.put(slug, new Read(read, now));
        return read;
    }

    private static ProjectRepoLinkRequest linkRequest(Repository repository, String name) {
        ProjectRepoLinkRequest request = new ProjectRepoLinkRequest();
        if (NEW.equals(repository.mode())) {
            request.setMode("CREATE");
            request.setRepoName(repoName(name));
            request.setPrivateRepo(repository.isPrivate());
        } else {
            request.setMode("LINK");
            request.setRepoFullName(repository.fullName());
        }
        return request;
    }

    /** Le nom d'un nouveau dépôt, depuis celui du projet : « Atlas Web » donne « atlas-web ». */
    static String repoName(String projectName) {
        String base = java.text.Normalizer.normalize(projectName, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]+", "-").replaceAll("^[-.]+|[-.]+$", "");
        if (base.isEmpty()) base = "project";
        return base.length() <= 100 ? base : base.substring(0, 100).replaceAll("[-.]+$", "");
    }

    /** La clé des issues, depuis le nom : lettres et chiffres en majuscules, de 2 à 10 ; « PRJ » en dernier recours. */
    static String identifier(String name) {
        String base = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "")
            .toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (base.length() < 2) return "PRJ";
        return base.substring(0, Math.min(10, base.length()));
    }

    /** Le nom ne dit que la pile (« Next.js », « projet Next.js », « Next.js app ») : ce n'est pas un nom. */
    static boolean onlyStack(String name, String stack) {
        if (name.isEmpty()) return true;
        String rest = IssueFields.key(withoutFillers(name));
        return rest.isEmpty() || rest.equals(IssueFields.key(stack)) || STACKS.contains(rest);
    }

    private static String withoutFillers(String name) {
        StringBuilder kept = new StringBuilder();
        for (String word : name.split("\\s+")) {
            if (!FILLERS.contains(word.toLowerCase(Locale.ROOT))) kept.append(word).append(' ');
        }
        return kept.toString().strip();
    }

    private static String text(String value) {
        return value == null ? "" : value.strip();
    }

    private static String clip(String value) {
        return value.length() <= 40 ? value : value.substring(0, 40) + "...";
    }
}
