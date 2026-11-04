package com.taskforce.tf_api.core.service.mcpserver;

import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalString;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

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
 * <p>Ce qu'il exige, TaskForce le demande, une question à la fois, et pas plus de deux pour une demande courante (le
 * signal d'arrêt de R115) ; « crée un projet Next.js », l'exemple de la Présidence :</p>
 * <ol>
 *   <li><b>le nom</b>, quand la demande n'en donne pas, ou ne dit que ce sur quoi le projet est construit (« Next.js »
 *       est une pile, pas un nom) ;</li>
 *   <li><b>où vit son code</b>, pour un projet de code (une pile nommée) : un nouveau dépôt, privé d'abord, ou public (sa
 *       visibilité dans le même choix, puisque le créer ne se défait pas d'ici), un dépôt qui existe, ou aucun pour
 *       l'instant. Un nouveau dépôt n'est proposé que là où TaskForce le crée (GitHub connecté) ; sans GitHub,
 *       aucune question, et la réponse dit comment en donner un.</li>
 * </ol>
 * <p>Le reste a un défaut sûr et ne se demande jamais : la clé du projet vient de son nom, et le projet n'est visible
 * que de ses membres. Tout se juge avant d'écrire ; un dépôt refusé par GitHub laisse le projet créé, et la réponse le
 * dit.</p>
 */
@Component
public class ProjectGestures {

    /** Ce que la conversation propose pour le dépôt d'un projet de code, et ce qu'un agent peut passer. */
    static final String NEW = "new";
    static final String NEW_PRIVATE = "new-private";
    static final String NEW_PUBLIC = "new-public";
    static final String NONE = "none";
    /** Les dépôts récents montrés en choix, à côté d'un nouveau dépôt et d'aucun : la carte tient en six choix. */
    private static final int RECENT_REPOS = 3;

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
        "nope", "pasdedepot", "norepository", "norepositoryfornow", "rien");
    private static final Set<String> PRIVATE = Set.of("private", "prive", "privee", "privé", "privée");
    private static final Set<String> PUBLIC = Set.of("public", "publique");

    private final ProjectService projectService;
    private final ProjectRepoService repoService;
    private final ProjectRepoHost repoHost;

    public ProjectGestures(ProjectService projectService, ProjectRepoService repoService, ProjectRepoHost repoHost) {
        this.projectService = projectService;
        this.repoService = repoService;
        this.repoHost = repoHost;
    }

    /** Le dépôt choisi : aucun, un nouveau (et sa visibilité), ou un existant ({@code owner/name}). */
    record Repository(String mode, boolean isPrivate, String fullName) {
        static final Repository NONE_YET = new Repository(null, true, null);

        boolean none() {
            return mode == null;
        }
    }

    /**
     * Crée le projet, et son dépôt quand c'en est un de code. Une question levée ({@link QuestionNeeded}) ne crée rien.
     * La phrase commence comme celle de l'ancien outil de Cortex : « Project created in TaskForce: KEY "nom" (id N). ».
     */
    public IssueGestures.Gesture create(String slug, Long userId, JsonNode args) {
        String stack = text(optionalString(args, "stack", 60));
        String name = text(optionalString(args, "name", 150));
        if (stack.isEmpty() && STACKS.contains(IssueFields.key(withoutFillers(name)))) {
            stack = name;
            name = "";
        } else if (!stack.isEmpty() && onlyStack(name, stack)) {
            name = "";
        }
        if (name.isEmpty()) {
            List<Question.Choice> suggestion = stack.isEmpty() ? List.of() : List.of(Question.Choice.of(stack + " app", stack + " app"));
            throw new QuestionNeeded(new Question("name", "What should the project be called?", suggestion));
        }
        Repository repository = repository(slug, name, !stack.isEmpty(), text(optionalString(args, "repository", 200)),
            text(optionalString(args, "repositoryVisibility", 20)));

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
        } else if (!stack.isEmpty() && !repoHost.createsRepos(slug) && !repoHost.linksRepos(slug)) {
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
     * peut faire ici : un nouveau dépôt (privé d'abord), un dépôt récent, ou aucun ; une réponse libre nomme un dépôt
     * {@code owner/name}. Un nouveau dépôt dont la visibilité n'est pas dite se demande aussi : public, son code serait
     * visible de tous, et cela ne se défait pas d'ici.
     */
    Repository repository(String slug, String name, boolean code, String asked, String visibility) {
        String said = IssueFields.key(asked);
        if (asked.isEmpty()) {
            if (!code) return Repository.NONE_YET;
            boolean creates = repoHost.createsRepos(slug);
            boolean links = repoHost.linksRepos(slug);
            if (!creates && !links) return Repository.NONE_YET;
            throw new QuestionNeeded(whereItLives(slug, name, creates, links, "Where does the code of " + name + " live?"));
        }
        if (NO_REPOSITORY.contains(said)) return Repository.NONE_YET;
        if (GitHubRepoNames.isFullName(asked)) {
            if (!repoHost.linksRepos(slug)) throw new QuestionNeeded(whereItLives(slug, name, false, false,
                "TaskForce can't link a repository here: connect GitHub in Settings > Integrations. Go on without one?"));
            return new Repository("LINK", true, asked);
        }
        boolean wantsNew = NEW.equals(said) || IssueFields.key(NEW_PRIVATE).equals(said) || IssueFields.key(NEW_PUBLIC).equals(said);
        if (!wantsNew) {
            throw new QuestionNeeded(whereItLives(slug, name, repoHost.createsRepos(slug), repoHost.linksRepos(slug),
                "\"" + clip(asked) + "\" isn't a repository: write it as owner/name. Where does the code of " + name + " live?"));
        }
        if (!repoHost.createsRepos(slug)) {
            throw new QuestionNeeded(whereItLives(slug, name, false, repoHost.linksRepos(slug),
                "TaskForce can't create a repository here. Where does the code of " + name + " live?"));
        }
        if (IssueFields.key(NEW_PRIVATE).equals(said)) return new Repository(NEW, true, null);
        if (IssueFields.key(NEW_PUBLIC).equals(said)) return new Repository(NEW, false, null);
        String seen = IssueFields.key(visibility);
        if (PRIVATE.contains(seen) || PRIVATE.contains(visibility.toLowerCase(Locale.ROOT))) return new Repository(NEW, true, null);
        if (PUBLIC.contains(seen)) return new Repository(NEW, false, null);
        throw new QuestionNeeded(new Question("repository", "Who can see the new repository of " + name + "?", List.of(
            Question.Choice.recommended(NEW_PRIVATE, "Private: only the people you add"),
            Question.Choice.of(NEW_PUBLIC, "Public: anyone on the internet"))));
    }

    /** La question du dépôt : ce que TaskForce peut faire ici, le nouveau dépôt privé en défaut. */
    private Question whereItLives(String slug, String name, boolean creates, boolean links, String text) {
        List<Question.Choice> choices = new ArrayList<>();
        if (creates) {
            choices.add(Question.Choice.recommended(NEW_PRIVATE, "A new private repository"));
            choices.add(Question.Choice.of(NEW_PUBLIC, "A new public repository"));
        }
        if (links) {
            for (String repo : repoHost.recentRepos(slug, RECENT_REPOS)) choices.add(Question.Choice.of(repo, repo));
        }
        choices.add(Question.Choice.of(NONE, "No repository for now"));
        return new Question("repository", text, choices);
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
