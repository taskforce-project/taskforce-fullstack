package com.taskforce.tf_api.core.service.agent.tools;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.ProjectStatus;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.Question;
import com.taskforce.tf_api.core.service.agent.QuestionNeeded;

import lombok.RequiredArgsConstructor;

/**
 * Le projet d'une demande à Cortex, par sa clé ou par son nom, résolu par le code parmi ceux que la personne voit. Le
 * modèle ne passe jamais d'identifiant : un numéro deviné avait créé une issue dans un autre projet (R48, séance n°8).
 * Inconnu ou ambigu, le résultat porte les choix possibles, que Cortex propose à la personne au lieu d'en prendre un.
 *
 * <p>Le projet d'un geste de la conversation (R135, séance n°20) se décide ici, et plus sur l'écran : celui que la demande
 * nomme, sinon celui de la conversation ; ni l'un ni l'autre, TaskForce demande lequel, sur une carte. L'étape 15 de la
 * recette : « Crée une issue Test » préparait la carte dans le projet ouvert à l'écran, sans que personne l'ait dit.</p>
 */
@Component
@RequiredArgsConstructor
public class ProjectResolver {

    /** L'argument d'un geste que la réponse de la personne remplit : son projet. */
    public static final String FIELD = "project";

    /** Au-delà, la liste des choix rendue au modèle est coupée : elle doit rester lisible. */
    private static final int MAX_CHOICES = 20;
    private static final int MAX_QUOTED = 40;
    /** Les mots qui posent un projet dans une phrase : « dans Website », « in the Website project ». */
    private static final String PLACE =
        "(?:^| )(?:dans|in|into|sur|projet|project)(?: le| la| l| the| mon| ma| my| notre| our)?(?: projet| project)? ";
    private static final String NO_PROJECT_YET = "There is no project in this workspace yet: one must be created first.";

    private final ProjectService projectService;

    /** Le projet trouvé, ou ce qu'il faut dire au modèle quand il n'y en a pas exactement un. */
    public record Resolution(ProjectResponse project, String problem) {
        public boolean found() {
            return project != null;
        }
    }

    /** Les projets que la personne voit dans l'espace. */
    public List<ProjectResponse> visible(AgentContext ctx) {
        return projectService.listProjects(ctx.slug(), ctx.userId());
    }

    /**
     * Le projet d'un geste de la conversation (R135) : celui que la demande nomme, sinon celui de la conversation. Sinon,
     * {@link QuestionNeeded} : TaskForce demande lequel, sur une carte, et rien n'est préparé ; un seul projet visible n'a
     * rien à demander. Le projet que le modèle passe ne compte que si la demande le dit : il a pu le lire à l'écran. Hors
     * d'un tour (une carte à laquelle la personne vient de répondre, un agent extérieur), il n'y a pas de demande à relire,
     * et le projet passé est le bon.
     *
     * @param requested ce que le modèle, ou la réponse de la personne, a passé
     * @param what      ce que le geste prépare (le titre d'une issue), que la question nomme ; vide sinon
     * @return le projet, ou le problème à dire quand l'espace n'en a aucun
     */
    public Resolution forGesture(Object requested, String what, AgentContext ctx) {
        List<ProjectResponse> projects = visible(ctx);
        if (projects.isEmpty()) return new Resolution(null, NO_PROJECT_YET);
        String query = requested == null ? "" : requested.toString().trim();
        if (!query.isEmpty() && named(query, projects, ctx.request())) {
            Resolution given = resolved(query, projects);
            if (given.found()) return given;
            List<ProjectResponse> close = matching(query, projects);
            String why = close.size() < projects.size() ? "Several projects match \"" : "No project matches \"";
            throw new QuestionNeeded(asking(close, ctx, why + clip(query) + "\". " + question(what)));
        }
        Optional<ProjectResponse> written = writtenIn(ctx.request(), projects);
        if (written.isPresent()) return new Resolution(written.get(), null);
        Optional<ProjectResponse> own = projects.stream().filter(p -> p.getId().equals(ctx.project())).findFirst();
        if (own.isPresent()) return new Resolution(own.get(), null);
        if (open(projects).size() == 1) return new Resolution(open(projects).get(0), null);
        throw new QuestionNeeded(asking(projects, ctx, question(what)));
    }

    /**
     * La question du projet, que « tu t'es trompé de projet » ouvre (R135) : les projets que la personne voit, en choix ;
     * vide quand il n'y en a pas d'autre à proposer.
     */
    public Optional<Question> whichProject(String what, AgentContext ctx) {
        List<ProjectResponse> projects = visible(ctx);
        return open(projects).size() < 2 ? Optional.empty() : Optional.of(asking(projects, ctx, question(what)));
    }

    /** Le projet que la demande de ce tour écrit elle-même : sa clé, ou son nom après « dans », « projet », « in »… */
    public Optional<ProjectResponse> writtenIn(AgentContext ctx) {
        return writtenIn(ctx.request(), visible(ctx));
    }

    private static String question(String what) {
        return what == null || what.isBlank() ? "Which project is this for?"
            : "Which project should \"" + clip(what) + "\" go in?";
    }

    /**
     * La carte : le projet à l'écran d'abord, car il renseigne, puis les autres ; aucun n'est coché d'avance, l'écran ne
     * décide pas. Au-delà de quatre, « Other » se lit parmi tous.
     */
    private static Question asking(List<ProjectResponse> projects, AgentContext ctx, String text) {
        Long onScreen = ctx.screen().projectId();
        List<Question.Choice> choices = open(projects).stream()
            .sorted((a, b) -> Boolean.compare(b.getId().equals(onScreen), a.getId().equals(onScreen)))
            .limit(Question.MAX_CHOICES)
            .map(project -> Question.Choice.of(project.getIdentifier(), project.getName(), project.getIdentifier()))
            .toList();
        return Question.of(FIELD, "Project", text, choices);
    }

    private static List<ProjectResponse> open(List<ProjectResponse> projects) {
        return projects.stream().filter(project -> project.getStatus() != ProjectStatus.ARCHIVED).toList();
    }

    /** Ce que le modèle a passé, s'il se lit dans la demande : tel quel, ou le projet qu'il désigne, sa clé ou son nom. */
    private static boolean named(String query, List<ProjectResponse> projects, String request) {
        if (request == null) return true;
        String said = plain(request);
        if (contains(said, query)) return true;
        ProjectResponse project = resolved(query, projects).project();
        return project != null && (contains(said, project.getIdentifier()) || contains(said, project.getName())
            || Pattern.compile(PLACE + firstWord(project.getName()) + "(?: |$)").matcher(said).find());
    }

    /**
     * La demande écrit le projet elle-même, quand le modèle l'a oublié : sa clé telle qu'elle s'écrit, ou tout son nom après
     * un mot qui pose un lieu ; un seul projet, sinon aucun. « Crée une issue Test » ne nomme pas le projet Test.
     */
    private static Optional<ProjectResponse> writtenIn(String request, List<ProjectResponse> projects) {
        if (request == null || request.isBlank()) return Optional.empty();
        String said = plain(request);
        List<ProjectResponse> written = open(projects).stream()
            .filter(project -> keyWritten(request, project.getIdentifier())
                || Pattern.compile(PLACE + Pattern.quote(plain(project.getName())) + "(?: |$)").matcher(said).find())
            .toList();
        return written.size() == 1 ? Optional.of(written.get(0)) : Optional.empty();
    }

    private static boolean keyWritten(String request, String key) {
        return key != null && !key.isBlank()
            && Pattern.compile("(?<![\\p{L}\\p{N}])" + Pattern.quote(key) + "(?![\\p{L}\\p{N}])").matcher(request).find();
    }

    private static boolean contains(String said, String value) {
        String wanted = plain(value);
        return !wanted.isEmpty() && (" " + said + " ").contains(" " + wanted + " ");
    }

    private static String firstWord(String name) {
        String flat = plain(name);
        int space = flat.indexOf(' ');
        return Pattern.quote(space < 0 ? flat : flat.substring(0, space));
    }

    /** Sans la casse, les accents ni la ponctuation, les mots séparés par un seul blanc. */
    private static String plain(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT)
            .replaceAll("[^\\p{L}\\p{N}]+", " ").strip();
    }

    private static String clip(String value) {
        return value.length() <= MAX_QUOTED ? value : value.substring(0, MAX_QUOTED) + "...";
    }

    /** Les projets dont la clé ou le nom contient ce qui est demandé ; tous quand aucun ne le contient. */
    private static List<ProjectResponse> matching(String query, List<ProjectResponse> projects) {
        String part = query.toLowerCase(Locale.ROOT);
        List<ProjectResponse> found = projects.stream()
            .filter(p -> (p.getName() != null && p.getName().toLowerCase(Locale.ROOT).contains(part))
                || (p.getIdentifier() != null && p.getIdentifier().toLowerCase(Locale.ROOT).contains(part)))
            .toList();
        return found.isEmpty() ? projects : found;
    }

    /** Par la clé exacte, puis le nom exact, puis une partie du nom si elle désigne un seul projet. */
    public Resolution resolve(Object requested, AgentContext ctx) {
        List<ProjectResponse> projects = visible(ctx);
        if (projects.isEmpty()) return new Resolution(null, NO_PROJECT_YET);
        String query = requested == null ? "" : requested.toString().trim();
        if (query.isEmpty()) {
            return new Resolution(null, "The project is missing. " + choices(projects));
        }
        return resolved(query, projects);
    }

    private static Resolution resolved(String query, List<ProjectResponse> projects) {
        List<ProjectResponse> byKey = projects.stream().filter(p -> query.equalsIgnoreCase(p.getIdentifier())).toList();
        if (byKey.size() == 1) return new Resolution(byKey.get(0), null);
        List<ProjectResponse> byName = projects.stream().filter(p -> query.equalsIgnoreCase(p.getName())).toList();
        if (byName.size() == 1) return new Resolution(byName.get(0), null);
        String part = query.toLowerCase(Locale.ROOT);
        List<ProjectResponse> byPart = projects.stream()
            .filter(p -> p.getName() != null && p.getName().toLowerCase(Locale.ROOT).contains(part))
            .toList();
        if (byName.isEmpty() && byPart.size() == 1) return new Resolution(byPart.get(0), null);
        List<ProjectResponse> several = byName.size() > 1 ? byName : byPart;
        if (several.size() > 1) {
            return new Resolution(null, "Several projects match \"" + query + "\": " + names(several)
                + ". Ask the person which one; do not pick one yourself.");
        }
        return new Resolution(null, "No project matches \"" + query + "\". " + choices(projects));
    }

    private static String choices(List<ProjectResponse> projects) {
        return "The projects are: " + names(projects) + ". Use the key or the name of one of them; if the request does "
            + "not say which, ask the person.";
    }

    private static String names(List<ProjectResponse> projects) {
        String listed = projects.stream().limit(MAX_CHOICES)
            .map(p -> p.getIdentifier() + " (" + p.getName() + ")")
            .collect(Collectors.joining(", "));
        return projects.size() > MAX_CHOICES ? listed + " and " + (projects.size() - MAX_CHOICES) + " more" : listed;
    }
}
