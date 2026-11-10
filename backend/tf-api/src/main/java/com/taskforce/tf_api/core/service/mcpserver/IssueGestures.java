package com.taskforce.tf_api.core.service.mcpserver;

import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalEnum;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalLong;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalString;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.requiredLong;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.requiredString;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.request.AddIssueToCycleRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.dto.response.CycleResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunActivityResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.dto.response.IssueCommentResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.ProjectMemberResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.dto.response.UserSummaryResponse;
import com.taskforce.tf_api.core.enums.CycleStatus;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.agent.Question;
import com.taskforce.tf_api.core.service.agent.QuestionNeeded;
import com.taskforce.tf_api.core.service.agent.Screen;
import com.taskforce.tf_api.core.service.agent.tools.CreateIssueTool;
import com.taskforce.tf_api.core.service.agent.tools.IssueFields;
import com.taskforce.tf_api.core.service.agent.tools.IssueFields.Found;
import com.taskforce.tf_api.core.service.delivery.ClaudeCodeProvider;
import com.taskforce.tf_api.core.service.delivery.DeliveryActivityService;
import com.taskforce.tf_api.core.service.delivery.DeliveryAgentProvider;
import com.taskforce.tf_api.core.service.delivery.DeliveryAgentProviderRegistry;
import com.taskforce.tf_api.core.service.delivery.DeliveryRunner;
import com.taskforce.tf_api.core.service.delivery.DeliveryService;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

/**
 * Les gestes sur une issue du MCP TaskForce (ADR-024, TF-J1-5) : changer ses champs, la déplacer, l'assigner, la
 * commenter, la confier à un agent, lire où en est sa mission, la supprimer. Ils s'ajoutent une fois, ici, et servent à Cortex dans
 * la conversation comme à un agent extérieur par le serveur MCP, avec les droits de la personne : chaque geste passe par
 * le même service que la route REST correspondante.
 *
 * <p>L'agent nomme l'issue par sa clé (« TF-12 ») et les valeurs par leur nom, résolus comme sur la carte de Cortex
 * ({@link IssueFields}) : « moi » est la personne qui demande, « To Do » la colonne « Todo ». Une valeur qui ne se résout
 * pas ne s'invente pas : l'erreur dit les choix.</p>
 *
 * <p>Ce qui s'annule se défait d'un geste (R77) : un changement garde les anciennes valeurs, un commentaire son id, et
 * « Undo » les remet tant que personne n'a rien changé depuis. Seul le dossier de Cortex garde ces données ; un client MCP
 * lit la phrase, l'issue et les changements ({@link Gesture#forClient}). Lire une mission ne décide rien : la personne
 * répond à une demande ou tranche un résultat par les boutons de ses cartes, jamais par un texte (R1).</p>
 */
@Component
public class IssueGestures {

    /** L'agent que l'activité de l'issue nomme pour un geste de Cortex dans la conversation. */
    public static final String CORTEX = CreateIssueTool.VIA;

    /** Les mots qui retirent une valeur (l'assigné, les points, le cycle, l'échéance), lus par {@link IssueFields#key}. */
    static final Set<String> NONE = Set.of("none", "nobody", "noone", "null", "unassigned", "unassign", "personne",
        "aucun", "aucune", "rien");

    /**
     * Une clé d'issue : la clé du projet, un tiret, le numéro (« TF-12 »). La clé d'un projet peut porter elle-même des
     * tirets et des chiffres (« HR-1372 », comme {@code CreateProjectRequest} l'accepte) : le numéro est ce qui suit le
     * dernier tiret, « HR-1372-2 » (vérification du 02/11/2026 avec qwen3:8b).
     */
    private static final Pattern KEY = Pattern.compile("^([A-Za-z0-9][A-Za-z0-9-]*)-(\\d{1,9})$");

    /** Les champs qu'un changement d'issue lit : sans aucun d'eux, rien n'est demandé. */
    private static final List<String> FIELDS = List.of("title", "description", "priority", "status", "statusId", "assignee",
        "assigneeId", "addLabels", "removeLabels", "points", "cycle", "dueDate");

    private static final String NOBODY = "nobody";
    private static final String NO_VALUE = "none";
    /** Ce que la mission dit de son agent, quand elle le dit trop long : de quoi relire, pas tout recopier. */
    private static final int MAX_SUMMARY = 1000;

    private final IssueService issueService;
    private final ProjectService projectService;
    private final CycleService cycleService;
    private final WorkspaceRepository workspaces;
    private final ProjectRepository projects;
    private final IssueRepository issues;
    private final ProjectVisibilityGuard visibility;
    private final DeliveryService deliveryService;
    private final DeliveryRunner deliveryRunner;
    private final DeliveryActivityService activityService;
    private final DeliveryAgentProviderRegistry providers;
    private final IssueFields fields;

    public IssueGestures(IssueService issueService, ProjectService projectService, CycleService cycleService,
                         WorkspaceRepository workspaces, ProjectRepository projects, IssueRepository issues,
                         ProjectVisibilityGuard visibility, DeliveryService deliveryService, DeliveryRunner deliveryRunner,
                         DeliveryActivityService activityService, DeliveryAgentProviderRegistry providers) {
        this.issueService = issueService;
        this.projectService = projectService;
        this.cycleService = cycleService;
        this.workspaces = workspaces;
        this.projects = projects;
        this.issues = issues;
        this.visibility = visibility;
        this.deliveryService = deliveryService;
        this.deliveryRunner = deliveryRunner;
        this.activityService = activityService;
        this.providers = providers;
        this.fields = new IssueFields(projectService, cycleService);
    }

    /** Un changement d'un champ, dans les mots de l'interface : de l'ancienne valeur à la nouvelle. */
    public record Change(String field, String from, String to) {}

    /**
     * Ce que rend un geste : la phrase qui le dit, l'issue qu'il touche ({@code issueId}, {@code projectId}, {@code key},
     * {@code title}, et {@code runId} de sa mission), ses changements, ce qu'un client lit en plus (le commentaire, la
     * mission), et de quoi le défaire (R77), que seul le dossier de Cortex garde.
     */
    public record Gesture(String summary, Map<String, Object> issue, List<Change> changes, Map<String, Object> detail,
                          Map<String, Object> undo) {

        /** Ce que lit un client MCP : tout, sauf de quoi défaire le geste. Un geste sur un projet n'a pas d'issue. */
        public Map<String, Object> forClient() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("summary", summary);
            if (issue != null) out.put("issue", issue);
            if (!changes.isEmpty()) out.put("changes", changes);
            out.putAll(detail);
            return out;
        }
    }

    // ------------------------------------------------------------------ l'issue nommée par sa clé

    /**
     * Les arguments, avec {@code projectId} et {@code issueId} quand l'agent a nommé l'issue par sa clé ({@code issue},
     * « TF-12 ») : la clé que la personne lit sur le tableau, cherchée parmi les projets qu'elle voit. Un projet privé
     * qu'elle ne voit pas répond comme une clé qui n'existe pas. Des ids passés l'emportent : rien n'est relu.
     */
    @Transactional(readOnly = true)
    public JsonNode withIds(String slug, Long userId, JsonNode args) {
        if (args == null || !args.isObject()) return args;
        JsonNode named = args.get("issue");
        if (named == null || named.isNull() || (args.hasNonNull("projectId") && args.hasNonNull("issueId"))) return args;
        String asked = named.isTextual() ? named.asText().strip() : "";
        Matcher key = KEY.matcher(asked);
        if (!key.matches()) {
            throw new McpArgs.InvalidArgumentException("issue must be the issue's key, like TF-12"
                + (asked.isEmpty() ? "" : ", not \"" + clip(asked, 40) + "\""));
        }
        String identifier = key.group(1).toUpperCase(Locale.ROOT);
        Long workspaceId = workspaces.findBySlug(slug).map(Workspace::getId)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found"));
        Project project = projects.findByWorkspaceIdAndIdentifier(workspaceId, identifier)
            .filter(p -> visibility.canView(p, userId)).orElse(null);
        Issue issue = project == null ? null
            : issues.findByProjectIdAndSequenceNumber(project.getId(), Integer.valueOf(key.group(2))).orElse(null);
        if (issue == null) {
            throw new McpArgs.InvalidArgumentException("There is no issue " + identifier + "-" + key.group(2)
                + " in this workspace: find its key with list_issues, by its column or its title.");
        }
        ObjectNode out = ((ObjectNode) args).deepCopy();
        out.put("projectId", project.getId());
        out.put("issueId", issue.getId());
        return out;
    }

    // ------------------------------------------------------------------ ce que TaskForce demande (R115)

    /**
     * Les gestes dont l'issue se désigne par la colonne que la demande nomme : supprimer (« supprime l'issue qu'il y a
     * dans In review by AI »). Pas déplacer : la colonne nommée y est celle où l'issue va, pas celle où elle est.
     */
    public static final Set<String> NAMED_BY_COLUMN = Set.of("delete_issue");

    /** Une clé écrite dans une phrase, avec son tiret ou une espace : « OPS-35 », « testta 2 ». */
    private static final Pattern KEY_IN_TEXT =
        Pattern.compile("(?<![\\p{L}\\p{N}])(\\p{L}[\\p{L}\\p{N}]{0,9})[-\\s](\\d{1,9})(?![\\p{L}\\p{N}])");
    /** Ce qui est entre guillemets est un titre cité, pas une colonne. L'apostrophe reste : « l'issue qu'il y a ». */
    private static final Pattern QUOTED = Pattern.compile("\"[^\"]*\"|“[^”]*”|«[^»]*»");
    /** Le plus long nom de colonne lu dans une demande, en mots. */
    private static final int MAX_COLUMN_WORDS = 8;

    /**
     * L'issue d'un geste de Cortex, telle que la demande la désigne : des ids, une clé qu'elle voit, ou ce qu'elle lit à
     * l'écran (une colonne, un bout de titre, « testta 2 ») quand cela ne désigne qu'une issue, comme un bout de nom ne
     * désigne qu'une personne ({@link IssueFields#assignee}). Sinon, rien ne se devine : TaskForce demande laquelle, avec
     * en choix les issues de l'écran (celles du projet ouvert, l'issue ouverte d'abord, en défaut), ou les siennes quand
     * aucun projet n'est ouvert. Rien n'est changé.
     */
    @Transactional(readOnly = true)
    public JsonNode issueOf(String slug, Long userId, Screen screen, JsonNode args, String question) {
        return issueOf(slug, userId, screen, args, question, null);
    }

    /**
     * La même, quand la demande de la personne peut nommer la colonne de l'issue ({@link #NAMED_BY_COLUMN}) : une colonne
     * nommée désigne l'issue, et non le titre que le modèle a choisi (test du CEO du 05/11/2026 : « supprime l'issue qu'il
     * y a dans In review by AI » donnait la carte de TESTTA-1, dans Done, au titre identique à celui de TESTTA-2). La
     * colonne est celle du tableau à l'écran ; sans tableau, celle de tous les projets que la personne voit. Une issue
     * dans cette colonne : c'est elle ; plusieurs : celles dont la demande écrit le titre, sinon TaskForce demande, avec
     * elles en choix ; aucune : TaskForce demande, avec l'écran en choix. Une clé que la personne écrit elle-même
     * l'emporte sur la colonne.
     *
     * @param request la demande telle que la personne l'a écrite ; null quand rien ne se lit dans ses mots (un agent
     *                extérieur, une réponse à une carte, un geste qui ne se désigne pas par sa colonne)
     */
    @Transactional(readOnly = true)
    public JsonNode issueOf(String slug, Long userId, Screen screen, JsonNode args, String question, String request) {
        if (args.hasNonNull("projectId") && args.hasNonNull("issueId")) return args;
        String asked = args.path("issue").isTextual() ? args.get("issue").asText().strip() : "";
        boolean byColumn = request != null && !request.isBlank();
        JsonNode found = null;
        IssueResponse picked = null;
        if (KEY.matcher(asked).matches()) {
            try {
                found = withIds(slug, userId, args);
                if (!byColumn) return found;
                picked = issueService.getIssue(slug, found.path("projectId").asLong(), found.path("issueId").asLong(), userId);
            } catch (McpArgs.InvalidArgumentException unknown) {
                // Une clé qu'elle ne voit pas : la question la remplace, avec ce qu'elle voit.
            } catch (RuntimeException unreadable) {
                return found; // la clé se résout, l'issue ne se relit pas : celle du modèle, comme avant
            }
        }
        boolean board = screen != null && !screen.isEmpty();
        List<IssueResponse> candidates = candidates(slug, userId, screen);
        if (byColumn) {
            // Le tableau à l'écran ; sans tableau, chaque projet que la personne voit : « In review by AI » n'y est pas
            // forcément celle de ses issues.
            List<IssueResponse> pool = board ? candidates : visibleIssues(slug, userId);
            if (!writesAKey(request, pool)) {
                IssueStatusResponse column = namedColumn(request, columnsOf(slug, userId, screen, pool), picked);
                if (column != null) return inColumn(args, column, pool, request, candidates, screen, question);
            }
        }
        if (found != null) return found;
        List<IssueResponse> named = asked.isEmpty() ? List.of() : designated(candidates, asked);
        if (named.size() == 1) return resolvedTo(args, named.get(0));
        throw new QuestionNeeded(whichIssue(question, named.isEmpty() ? candidates : named, screen));
    }

    /**
     * L'issue de la colonne que la demande nomme : la seule qui s'y trouve ; plusieurs, celles dont la demande écrit le
     * titre (« supprime Ajouter la version LTS, celle qui est dans In review by AI ») ; sinon la question de TaskForce,
     * avec celles de la colonne en choix, ou l'écran quand la colonne est vide.
     */
    private JsonNode inColumn(JsonNode args, IssueStatusResponse column, List<IssueResponse> pool, String request,
                              List<IssueResponse> screenIssues, Screen screen, String question) {
        // Par son nom : sans tableau à l'écran, des projets différents ont des colonnes homonymes.
        String name = IssueFields.key(column.getName());
        List<IssueResponse> there = pool.stream()
            .filter(issue -> issue.getStatus() != null && name.equals(IssueFields.key(issue.getStatus().getName())))
            .toList();
        String said = IssueFields.key(request);
        List<IssueResponse> titled = there.stream()
            .filter(issue -> IssueFields.key(issue.getTitle()).length() >= 3 && said.contains(IssueFields.key(issue.getTitle())))
            .toList();
        List<IssueResponse> chosen = titled.isEmpty() ? there : titled;
        if (chosen.size() == 1) return resolvedTo(args, chosen.get(0));
        String why = chosen.isEmpty() ? "No issue is in " + column.getName() + ". "
            : chosen.size() + " issues are in " + column.getName() + ". ";
        throw new QuestionNeeded(whichIssue(why + question, chosen.isEmpty() ? screenIssues : chosen, screen));
    }

    /**
     * Les issues de tous les projets que la personne voit, les dernières changées d'abord, avec ses droits ; une lecture
     * refusée n'en donne aucune de ce projet.
     */
    private List<IssueResponse> visibleIssues(String slug, Long userId) {
        List<IssueResponse> all = new ArrayList<>();
        List<ProjectResponse> seen;
        try {
            seen = projectService.listProjects(slug, userId);
        } catch (RuntimeException e) {
            return List.of();
        }
        for (ProjectResponse project : seen) {
            try {
                all.addAll(issueService.listIssues(slug, project.getId(), userId));
            } catch (RuntimeException e) {
                // Un projet qu'elle ne lit pas (ou plus) : ses issues ne comptent pas.
            }
        }
        return all.stream()
            .filter(issue -> !issue.isArchived())
            .sorted(Comparator.comparing(IssueGestures::changedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .toList();
    }

    private static ObjectNode resolvedTo(JsonNode args, IssueResponse issue) {
        ObjectNode out = ((ObjectNode) args).deepCopy();
        out.put("issue", issue.getIdentifier());
        out.put("projectId", issue.getProjectId());
        out.put("issueId", issue.getId());
        return out;
    }

    /** La question « laquelle ? », avec ces issues en choix : l'issue ouverte, quand elle en est, en défaut. */
    private static Question whichIssue(String question, List<IssueResponse> shown, Screen screen) {
        Long open = screen == null ? null : screen.issueId();
        return Question.of("issue", "Issue", question, shown.stream()
            .map(issue -> Objects.equals(open, issue.getId())
                ? Question.Choice.recommended(issue.getIdentifier(), choiceLabel(issue), whereItIs(issue))
                : Question.Choice.of(issue.getIdentifier(), choiceLabel(issue), whereItIs(issue)))
            .toList());
    }

    /**
     * Les colonnes où chercher celle que la demande nomme : celles du projet de l'écran (une colonne vide compte aussi),
     * sinon celles des issues de la personne. Une lecture refusée n'en donne aucune.
     */
    private List<IssueStatusResponse> columnsOf(String slug, Long userId, Screen scope, List<IssueResponse> candidates) {
        if (scope != null && !scope.isEmpty()) {
            try {
                return issueService.listStatuses(slug, scope.projectId(), userId);
            } catch (RuntimeException e) {
                return List.of();
            }
        }
        Map<Long, IssueStatusResponse> seen = new LinkedHashMap<>();
        candidates.stream().map(IssueResponse::getStatus).filter(Objects::nonNull)
            .forEach(status -> seen.putIfAbsent(status.getId(), status));
        return List.copyOf(seen.values());
    }

    /**
     * La colonne que la demande nomme, en mots entiers (« to do » est « Todo », « in-review » est « In Review »), hors de
     * ce qu'elle cite entre guillemets. La plus longue l'emporte (« In review by AI » plutôt que « In review ») ; deux
     * colonnes différentes, ou aucune : null. Les mots d'une colonne qui sont dans le titre de l'issue que le modèle a
     * choisie s'expliquent par ce titre (« Done page redesign ») : ils ne nomment pas de colonne.
     */
    static IssueStatusResponse namedColumn(String request, List<IssueStatusResponse> columns, IssueResponse picked) {
        List<String> words = words(QUOTED.matcher(request).replaceAll(" "));
        List<String> title = picked == null ? List.of() : words(picked.getTitle());
        // Chaque colonne nommée, par son nom, et où la demande la dit (début et fin, en mots).
        Map<String, IssueStatusResponse> named = new LinkedHashMap<>();
        Map<String, List<int[]>> where = new LinkedHashMap<>();
        for (IssueStatusResponse column : columns) {
            String name = IssueFields.key(column.getName());
            if (name.length() < 2 || named.containsKey(name) || !spans(title, name).isEmpty()) continue;
            List<int[]> spans = spans(words, name);
            if (spans.isEmpty()) continue;
            named.put(name, column);
            where.put(name, spans);
        }
        // Une colonne dite dans le nom d'une autre (« In review » dans « In review by AI ») n'est pas nommée à part.
        List<String> kept = named.keySet().stream()
            .filter(name -> where.get(name).stream().anyMatch(span -> where.entrySet().stream()
                .noneMatch(other -> !other.getKey().equals(name) && other.getValue().stream()
                    .anyMatch(outer -> outer[0] <= span[0] && span[1] <= outer[1] && outer[1] - outer[0] > span[1] - span[0]))))
            .toList();
        return kept.size() == 1 ? named.get(kept.get(0)) : null;
    }

    /** Où la phrase dit ce nom (lu par {@link IssueFields#key}), en mots entiers à la suite : début et fin de chaque fois. */
    private static List<int[]> spans(List<String> words, String name) {
        List<int[]> spans = new ArrayList<>();
        for (int start = 0; start < words.size(); start++) {
            StringBuilder joined = new StringBuilder();
            for (int end = start; end < words.size() && end - start < MAX_COLUMN_WORDS; end++) {
                joined.append(words.get(end));
                if (joined.length() > name.length()) break;
                if (joined.toString().equals(name)) {
                    spans.add(new int[] {start, end + 1});
                    break;
                }
            }
        }
        return spans;
    }

    /** Les mots d'un texte, lus par {@link IssueFields#key} : sans la casse, les accents ni la ponctuation. */
    private static List<String> words(String text) {
        if (text == null) return List.of();
        List<String> out = new ArrayList<>();
        for (String word : text.split("[^\\p{L}\\p{N}]+")) {
            String key = IssueFields.key(word);
            if (!key.isEmpty()) out.add(key);
        }
        return out;
    }

    /** La demande écrit la clé d'une de ces issues (« TESTTA-2 », « testta 2 ») : la personne l'a nommée elle-même. */
    private static boolean writesAKey(String request, List<IssueResponse> candidates) {
        Set<String> written = new HashSet<>();
        Matcher key = KEY_IN_TEXT.matcher(request);
        while (key.find()) written.add(IssueFields.key(key.group(1) + key.group(2)));
        return !written.isEmpty() && candidates.stream()
            .anyMatch(issue -> issue.getIdentifier() != null && written.contains(IssueFields.key(issue.getIdentifier())));
    }

    /**
     * Les issues que la personne a sous les yeux : celles du projet ouvert, l'issue ouverte d'abord puis les dernières
     * changées, avec ses droits ; sans projet ouvert, les siennes. Une lecture refusée n'en donne aucune.
     */
    private List<IssueResponse> candidates(String slug, Long userId, Screen screen) {
        List<IssueResponse> issues;
        try {
            issues = screen != null && !screen.isEmpty()
                ? issueService.listIssues(slug, screen.projectId(), userId)
                : issueService.listMyIssues(slug, userId);
        } catch (RuntimeException e) {
            return List.of();
        }
        Long open = screen == null ? null : screen.issueId();
        return issues.stream()
            .filter(issue -> !issue.isArchived())
            .sorted(Comparator.comparing((IssueResponse issue) -> !Objects.equals(open, issue.getId()))
                .thenComparing(IssueGestures::changedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .toList();
    }

    /**
     * Les issues que désigne ce que la demande en dit : sa clé écrite autrement (« testta 2 »), le nom de sa colonne
     * (« in review by AI »), ou un bout de son titre. Lu sans la casse, les espaces ni la ponctuation.
     */
    private static List<IssueResponse> designated(List<IssueResponse> candidates, String asked) {
        String wanted = IssueFields.key(asked);
        if (wanted.length() < 2) return List.of();
        List<IssueResponse> byKey = candidates.stream()
            .filter(issue -> wanted.equals(IssueFields.key(issue.getIdentifier()))).toList();
        if (!byKey.isEmpty()) return byKey;
        List<IssueResponse> byColumn = candidates.stream()
            .filter(issue -> issue.getStatus() != null && IssueFields.key(issue.getStatus().getName()).length() >= 4
                && wanted.contains(IssueFields.key(issue.getStatus().getName())))
            .toList();
        if (!byColumn.isEmpty()) return byColumn;
        return wanted.length() < 3 ? List.of() : candidates.stream()
            .filter(issue -> IssueFields.key(issue.getTitle()).contains(wanted)).toList();
    }

    private static String choiceLabel(IssueResponse issue) {
        String title = issue.getTitle() == null ? "" : issue.getTitle().replaceAll("\\s+", " ").strip();
        return (issue.getIdentifier() + " " + clip(title, 50)).strip();
    }

    /** Ce qu'une colonne veut dire sur le tableau, en une ligne, pour un choix de colonne. */
    private static String stage(IssueStatusCategory category) {
        if (category == null) return null;
        return switch (category) {
            case BACKLOG -> "Not planned yet";
            case UNSTARTED -> "Planned, not started";
            case STARTED -> "Work in progress";
            case COMPLETED -> "Done";
            case CANCELLED -> "Dropped";
        };
    }

    /** Deux noms lus par {@link IssueFields#key} se ressemblent quand l'un contient l'autre. */
    private static boolean looksLike(String name, String wanted) {
        return wanted.length() >= 3 && !name.isEmpty() && (name.contains(wanted) || wanted.contains(name));
    }

    /** Ce qu'un choix d'issue dit en une ligne : sa colonne, et qui la prend. */
    private static String whereItIs(IssueResponse issue) {
        String column = issue.getStatus() == null ? null : issue.getStatus().getName();
        String who = issue.getAssignee() == null ? null : "assigned to " + name(issue.getAssignee());
        if (column == null) return who;
        return who == null ? column : column + ", " + who;
    }

    private static LocalDateTime changedAt(IssueResponse issue) {
        return issue.getUpdatedAt() != null ? issue.getUpdatedAt() : issue.getCreatedAt();
    }

    /**
     * Qui prend l'issue, quand le nom ne désigne pas un seul membre (R115) : ceux qu'il désigne, sinon les membres du
     * projet, en choix ; « personne » quand l'issue a un assigné. Le défaut n'existe pas : TaskForce ne choisit pas.
     */
    private Question whoTakes(String slug, Long userId, ProjectResponse project, IssueResponse before, String asked) {
        List<ProjectMemberResponse> members = projectService.listMembers(slug, project.getId(), userId);
        String wanted = asked.toLowerCase(Locale.ROOT);
        List<ProjectMemberResponse> matching = members.stream()
            .filter(m -> (m.getDisplayName() != null && m.getDisplayName().toLowerCase(Locale.ROOT).contains(wanted))
                || (m.getEmail() != null && m.getEmail().toLowerCase(Locale.ROOT).startsWith(wanted)))
            .toList();
        boolean several = matching.size() > 1;
        String why;
        if (several) {
            why = "Several members of " + project.getName() + " match \"" + clip(asked, 40) + "\".";
        } else if (IssueFields.SELF.contains(IssueFields.key(asked))) {
            why = "You are not a member of " + project.getName() + ".";
        } else {
            why = "No member of " + project.getName() + " matches \"" + clip(asked, 40) + "\".";
        }
        // « Nobody » garde sa place sur la carte quand l'issue a un assigné.
        int room = Question.MAX_CHOICES - (before.getAssignee() != null ? 1 : 0);
        List<Question.Choice> choices = new ArrayList<>((several ? matching : members).stream().limit(room)
            .map(m -> Question.Choice.of(m.getEmail() != null ? m.getEmail() : IssueFields.name(m), IssueFields.name(m),
                m.getEmail() != null && !m.getEmail().equals(IssueFields.name(m)) ? m.getEmail() : "Member of " + project.getName()))
            .toList());
        if (before.getAssignee() != null) {
            choices.add(Question.Choice.of(NO_VALUE, "Nobody", "Unassigns " + before.getIdentifier()));
        }
        return Question.of("assignee", "Assignee", "Who should take " + before.getIdentifier() + "? " + why, choices);
    }

    // ------------------------------------------------------------------ changer les champs, déplacer, assigner

    /**
     * Change ce que l'agent passe : le titre, la description, la priorité, la colonne (déplacer), l'assigné (assigner),
     * des labels ajoutés ou retirés, les points, le cycle, l'échéance. « none » retire l'assigné, les points, le cycle
     * ou l'échéance. Ce qui ne change rien ne s'écrit pas. Tout se résout avant d'écrire : une valeur inconnue n'écrit
     * rien.
     */
    @Transactional
    public Gesture update(String slug, Long userId, JsonNode args) {
        long projectId = requiredLong(args, "projectId");
        long issueId = requiredLong(args, "issueId");
        if (FIELDS.stream().noneMatch(args::hasNonNull)) {
            throw new McpArgs.InvalidArgumentException("Nothing to update: pass at least one field");
        }
        writable(slug, projectId, userId);
        IssueResponse before = issueService.getIssue(slug, projectId, issueId, userId);
        ProjectResponse project = projectService.getProject(slug, projectId, userId);
        UpdateIssueRequest request = new UpdateIssueRequest();
        List<Change> changes = new ArrayList<>();
        Map<String, Object> undo = new LinkedHashMap<>();

        String title = optionalString(args, "title", 500);
        if (title != null && !title.isBlank() && !title.strip().equals(before.getTitle())) {
            request.setTitle(title.strip());
            changes.add(new Change("title", before.getTitle(), title.strip()));
            undo.put("title", pair(before.getTitle(), title.strip()));
        }
        String description = optionalString(args, "description", 20_000);
        if (description != null && !description.equals(text(before.getDescription()))) {
            request.setDescription(description);
            changes.add(new Change("description", null, null));
            undo.put("description", pair(text(before.getDescription()), description));
        }
        IssuePriority priority = optionalEnum(args, "priority", IssuePriority.class);
        if (priority != null && priority != before.getPriority()) {
            request.setPriority(priority);
            changes.add(new Change("priority", label(before.getPriority()), label(priority)));
            undo.put("priority", pair(before.getPriority() == null ? null : before.getPriority().name(), priority.name()));
        }
        column(slug, userId, project, args, before, request, changes, undo);
        assignee(slug, userId, project, args, before, request, changes, undo);
        labels(slug, userId, project, args, before, request, changes, undo);
        points(args, before, request, changes, undo);
        List<List<Long>> cycles = cycle(slug, userId, project, args, issueId, changes, undo);
        dueDate(args, before, request, changes, undo);

        if (changes.isEmpty()) {
            return new Gesture(named(before) + " already has these values: nothing changed.", ref(before, projectId, null),
                List.of(), Map.of(), null);
        }
        IssueResponse after = changes.stream().allMatch(c -> "cycle".equals(c.field())) ? before
            : issueService.updateIssue(slug, projectId, issueId, request, userId);
        if (cycles != null) moveCycles(slug, userId, projectId, issueId, cycles.get(0), cycles.get(1));
        Map<String, Object> restore = new LinkedHashMap<>();
        restore.put("projectId", projectId);
        restore.put("issueId", issueId);
        restore.put("key", after.getIdentifier());
        restore.put("fields", undo);
        return new Gesture("Updated " + named(after) + ": " + said(changes) + ".", ref(after, projectId, null), changes,
            Map.of(), restore);
    }

    /** La colonne, par son nom (« To Do » est « Todo ») ou son id ; inconnue, l'erreur dit les colonnes du projet. */
    private void column(String slug, Long userId, ProjectResponse project, JsonNode args, IssueResponse before,
                        UpdateIssueRequest request, List<Change> changes, Map<String, Object> undo) {
        Long statusId = optionalLong(args, "statusId");
        String asked = optionalString(args, "status", 100);
        if (statusId == null && (asked == null || asked.isBlank())) return;
        List<IssueStatusResponse> columns = issueService.listStatuses(slug, project.getId(), userId);
        IssueStatusResponse column = statusId != null
            ? columns.stream().filter(c -> statusId.equals(c.getId())).findFirst().orElse(null)
            : IssueFields.named(columns, asked);
        Long current = before.getStatus() == null ? null : before.getStatus().getId();
        if (column == null && statusId != null) {
            throw new McpArgs.InvalidArgumentException("There is no column " + statusId + " in " + project.getName()
                + ". Its columns are: " + IssueFields.listed(columns, IssueStatusResponse::getName) + ".");
        }
        if (column == null) {
            // R115 : une colonne nommée qui n'existe pas ne s'invente pas, TaskForce demande, avec celles du projet : celles
            // dont le nom ressemble à ce qui est écrit d'abord (« review » : In Review, In review by AI), puis le tableau.
            String wanted = IssueFields.key(asked);
            throw new QuestionNeeded(Question.of("status", "Column", "Which column should " + before.getIdentifier()
                + " move to? \"" + clip(asked.strip(), 40) + "\" isn't a column of " + project.getName() + ".", columns.stream()
                    .filter(c -> !c.getId().equals(current))
                    .sorted(Comparator.comparing((IssueStatusResponse c) -> !looksLike(IssueFields.key(c.getName()), wanted)))
                    .map(c -> Question.Choice.of(c.getName(), c.getName(), stage(c.getCategory())))
                    .toList()));
        }
        if (column.getId().equals(current)) return;
        request.setStatusId(column.getId());
        changes.add(new Change("column", before.getStatus() == null ? NO_VALUE : before.getStatus().getName(), column.getName()));
        undo.put("status", pair(current, column.getId()));
    }

    /** L'assigné : un membre du projet, par son nom, son e-mail ou « moi », ou son id ; « none » le retire. */
    private void assignee(String slug, Long userId, ProjectResponse project, JsonNode args, IssueResponse before,
                          UpdateIssueRequest request, List<Change> changes, Map<String, Object> undo) {
        Long assigneeId = optionalLong(args, "assigneeId");
        String asked = optionalString(args, "assignee", 200);
        if (assigneeId == null && (asked == null || asked.isBlank())) return;
        Long current = before.getAssignee() == null ? null : before.getAssignee().getId();
        String currentName = before.getAssignee() == null ? NOBODY : name(before.getAssignee());
        if (assigneeId == null && NONE.contains(IssueFields.key(asked))) {
            if (current == null) return;
            request.setUnassign(true);
            changes.add(new Change("assignee", currentName, NOBODY));
            undo.put("assignee", pair(current, null));
            return;
        }
        ProjectMemberResponse member;
        if (assigneeId != null) {
            member = projectService.listMembers(slug, project.getId(), userId).stream()
                .filter(m -> assigneeId.equals(m.getUserId())).findFirst()
                .orElseThrow(() -> new McpArgs.InvalidArgumentException("The user " + assigneeId + " is not a member of "
                    + project.getName() + "."));
        } else {
            Found<ProjectMemberResponse> found = fields.assignee(project, asked.strip(), slug, userId);
            if (!found.ok()) throw new QuestionNeeded(whoTakes(slug, userId, project, before, asked.strip()));
            member = found.value();
        }
        if (member.getUserId().equals(current)) return;
        request.setAssigneeId(member.getUserId());
        changes.add(new Change("assignee", currentName, IssueFields.name(member)));
        undo.put("assignee", pair(current, member.getUserId()));
    }

    /** Des labels du projet ajoutés ou retirés, par leur nom : jamais un nouveau label, et les autres restent. */
    private void labels(String slug, Long userId, ProjectResponse project, JsonNode args, IssueResponse before,
                        UpdateIssueRequest request, List<Change> changes, Map<String, Object> undo) {
        List<String> add = names(args, "addLabels");
        List<String> remove = names(args, "removeLabels");
        if (add.isEmpty() && remove.isEmpty()) return;
        Found<List<ProjectLabelResponse>> added = fields.labels(project, add, slug, userId);
        if (!added.ok()) throw whichLabels(slug, userId, project, before, add, added.problem());
        Found<List<ProjectLabelResponse>> removed = fields.labels(project, remove, slug, userId);
        if (!removed.ok()) throw new McpArgs.InvalidArgumentException(removed.problem());
        List<ProjectLabelResponse> current = before.getLabels() == null ? List.of() : before.getLabels();
        Map<Long, ProjectLabelResponse> next = new LinkedHashMap<>();
        current.forEach(l -> next.put(l.getId(), l));
        removed.value().forEach(l -> next.remove(l.getId()));
        added.value().forEach(l -> next.putIfAbsent(l.getId(), l));
        List<Long> from = current.stream().map(ProjectLabelResponse::getId).toList();
        List<Long> to = List.copyOf(next.keySet());
        if (new HashSet<>(from).equals(new HashSet<>(to))) return;
        request.setLabelIds(to);
        changes.add(new Change("labels", labelNames(current), labelNames(next.values().stream().toList())));
        undo.put("labels", pair(from, to));
    }

    /**
     * Un label à ajouter qui n'existe pas (R115) : il ne s'invente pas, TaskForce demande lesquels, parmi ceux du projet
     * que l'issue n'a pas encore, et plusieurs se cochent : les labels ne s'excluent pas. Ceux que la demande nomme et qui
     * existent viennent d'abord, recommandés. Sans label à proposer, l'erreur reste, qui le dit.
     */
    private RuntimeException whichLabels(String slug, Long userId, ProjectResponse project, IssueResponse before,
                                         List<String> asked, String problem) {
        List<ProjectLabelResponse> existing = projectService.listLabels(slug, project.getId(), userId);
        Set<Long> has = before.getLabels() == null ? Set.of()
            : before.getLabels().stream().map(ProjectLabelResponse::getId).collect(Collectors.toSet());
        Set<String> named = asked.stream().map(name -> name.toLowerCase(Locale.ROOT)).collect(Collectors.toSet());
        List<ProjectLabelResponse> offered = existing.stream().filter(label -> !has.contains(label.getId()))
            .sorted(Comparator.comparing((ProjectLabelResponse label) -> !named.contains(label.getName().toLowerCase(Locale.ROOT))))
            .toList();
        String unknown = asked.stream()
            .filter(name -> existing.stream().noneMatch(label -> name.equalsIgnoreCase(label.getName())))
            .findFirst().orElse(null);
        if (offered.isEmpty() || unknown == null) return new McpArgs.InvalidArgumentException(problem);
        return new QuestionNeeded(Question.several("addLabels", "Labels", "Which labels should " + before.getIdentifier()
            + " get? \"" + clip(unknown, 40) + "\" isn't a label of " + project.getName() + ".", offered.stream()
                .map(label -> {
                    String about = label.getDescription() == null || label.getDescription().isBlank() ? null
                        : clip(label.getDescription().strip(), 80);
                    return named.contains(label.getName().toLowerCase(Locale.ROOT))
                        ? Question.Choice.recommended(label.getName(), label.getName(), about)
                        : Question.Choice.of(label.getName(), label.getName(), about);
                })
                .toList()));
    }

    /** L'estimation, de 1 à 100 ; 0 ou « none » la retire. */
    private static void points(JsonNode args, IssueResponse before, UpdateIssueRequest request, List<Change> changes,
                               Map<String, Object> undo) {
        JsonNode raw = args.get("points");
        if (raw == null || raw.isNull()) return;
        Integer points;
        if (raw.isTextual() && NONE.contains(IssueFields.key(raw.asText()))) {
            points = null;
        } else {
            Found<Integer> found = IssueFields.points(raw.isNumber() ? raw.numberValue() : raw.asText());
            if (!found.ok()) throw new McpArgs.InvalidArgumentException(found.problem());
            points = found.value();
        }
        if (Objects.equals(points, before.getStoryPoints())) return;
        request.setStoryPoints(points == null ? 0 : points);
        changes.add(new Change("points", points(before.getStoryPoints()), points(points)));
        undo.put("points", pair(before.getStoryPoints(), points));
    }

    /**
     * Le cycle : l'issue quitte ses cycles ouverts pour celui qu'on nomme (jamais créé ; un cycle terminé garde son
     * histoire) ; « none » la sort de ses cycles ouverts. Rend les cycles avant et après, ou null sans changement.
     */
    private List<List<Long>> cycle(String slug, Long userId, ProjectResponse project, JsonNode args, long issueId,
                                   List<Change> changes, Map<String, Object> undo) {
        String asked = optionalString(args, "cycle", 200);
        if (asked == null || asked.isBlank()) return null;
        List<CycleResponse> open = openCycles(slug, userId, project.getId(), issueId);
        CycleResponse target = null;
        if (!NONE.contains(IssueFields.key(asked))) {
            Found<CycleResponse> found = fields.cycle(project, asked.strip(), slug, userId);
            if (!found.ok()) throw new McpArgs.InvalidArgumentException(found.problem());
            target = found.value();
        }
        List<Long> from = open.stream().map(CycleResponse::getId).toList();
        List<Long> to = target == null ? List.of() : List.of(target.getId());
        if (new HashSet<>(from).equals(new HashSet<>(to))) return null;
        String was = open.isEmpty() ? NO_VALUE : open.stream().map(CycleResponse::getName).collect(Collectors.joining(", "));
        changes.add(new Change("cycle", was, target == null ? NO_VALUE : target.getName()));
        undo.put("cycles", pair(from, to));
        return List.of(from, to);
    }

    /** L'échéance, écrite YYYY-MM-DD ; « none » la retire. Une date passée est une erreur de l'agent, pas un choix. */
    private static void dueDate(JsonNode args, IssueResponse before, UpdateIssueRequest request, List<Change> changes,
                                Map<String, Object> undo) {
        String asked = optionalString(args, "dueDate", 40);
        if (asked == null || asked.isBlank()) return;
        String current = before.getDueDate() == null ? null : before.getDueDate().toString();
        if (NONE.contains(IssueFields.key(asked))) {
            if (current == null) return;
            request.setClearDueDate(true);
            changes.add(new Change("due date", current, NO_VALUE));
            undo.put("dueDate", pair(current, null));
            return;
        }
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate due;
        try {
            due = asked.strip().matches("\\d{4}-\\d{2}-\\d{2}") ? LocalDate.parse(asked.strip()) : null;
        } catch (DateTimeParseException e) {
            due = null;
        }
        if (due == null) {
            throw new McpArgs.InvalidArgumentException("dueDate must be a date written YYYY-MM-DD, for example "
                + today.plusWeeks(1) + ", or none.");
        }
        // Un jour de marge : « aujourd'hui » n'est pas le même jour partout quand l'instance compte en UTC.
        if (due.isBefore(today.minusDays(1))) {
            throw new McpArgs.InvalidArgumentException("dueDate " + due + " is in the past (today is " + today
                + "): choose a later date, or none.");
        }
        if (due.toString().equals(current)) return;
        request.setDueDate(due.toString());
        changes.add(new Change("due date", current == null ? NO_VALUE : current, due.toString()));
        undo.put("dueDate", pair(current, due.toString()));
    }

    /**
     * Remet une issue comme elle était avant le changement de Cortex (« Undo », R77), si personne ne l'a changée
     * depuis : sinon, rien ne bouge et la réponse dit quoi a changé, à reprendre depuis l'issue.
     */
    @Transactional
    public String restore(String slug, Long userId, JsonNode undo) {
        JsonNode changed = undo == null ? null : undo.get("fields");
        if (changed == null || !changed.isObject() || changed.isEmpty()) {
            throw new BusinessException("This change can't be undone from here.");
        }
        long projectId = undo.path("projectId").asLong();
        long issueId = undo.path("issueId").asLong();
        writable(slug, projectId, userId);
        IssueResponse now = issueService.getIssue(slug, projectId, issueId, userId);
        List<CycleResponse> open = changed.has("cycles") ? openCycles(slug, userId, projectId, issueId) : List.of();
        List<String> moved = moved(changed, now, open);
        if (!moved.isEmpty()) {
            throw new BusinessException(now.getIdentifier() + " changed since (" + String.join(", ", moved)
                + "), so Undo would erase that: change it back from the issue.");
        }
        UpdateIssueRequest request = new UpdateIssueRequest();
        changed.fields().forEachRemaining(field -> {
            JsonNode from = field.getValue().get("from");
            boolean none = from == null || from.isNull();
            switch (field.getKey()) {
                case "title" -> {
                    if (!none) request.setTitle(from.asText());
                }
                case "description" -> request.setDescription(none ? "" : from.asText());
                case "priority" -> request.setPriority(none ? IssuePriority.NONE : IssuePriority.valueOf(from.asText()));
                case "status" -> request.setStatusId(from.asLong());
                case "assignee" -> {
                    if (none) request.setUnassign(true);
                    else request.setAssigneeId(from.asLong());
                }
                case "labels" -> request.setLabelIds(longs(from));
                case "points" -> request.setStoryPoints(none ? 0 : from.asInt());
                case "dueDate" -> {
                    if (none) request.setClearDueDate(true);
                    else request.setDueDate(from.asText());
                }
                default -> { } // les cycles se remettent à part
            }
        });
        if (changed.size() > (changed.has("cycles") ? 1 : 0)) {
            issueService.updateIssue(slug, projectId, issueId, request, userId);
        }
        if (changed.has("cycles")) {
            moveCycles(slug, userId, projectId, issueId, longs(changed.path("cycles").path("to")),
                longs(changed.path("cycles").path("from")));
        }
        List<String> put = new ArrayList<>();
        changed.fieldNames().forEachRemaining(field -> put.add(FIELD_NAMES.getOrDefault(field, field)));
        return "Put back " + joined(put) + " of " + named(now) + " as " + (put.size() == 1 ? "it was" : "they were") + ".";
    }

    /** Les champs de l'undo dans les mots de l'interface. */
    private static final Map<String, String> FIELD_NAMES = Map.of("status", "the column", "assignee", "the assignee",
        "labels", "the labels", "points", "the points", "cycles", "the cycle", "dueDate", "the due date",
        "title", "the title", "description", "the description", "priority", "the priority");

    /** Ce qui a changé depuis le geste de Cortex : ce que l'undo écraserait. */
    private static List<String> moved(JsonNode changed, IssueResponse now, List<CycleResponse> open) {
        List<String> moved = new ArrayList<>();
        changed.fields().forEachRemaining(field -> {
            JsonNode to = field.getValue().get("to");
            boolean same = switch (field.getKey()) {
                case "title" -> Objects.equals(now.getTitle(), asText(to));
                case "description" -> Objects.equals(text(now.getDescription()), text(asText(to)));
                case "priority" -> Objects.equals(now.getPriority() == null ? null : now.getPriority().name(), asText(to));
                case "status" -> Objects.equals(now.getStatus() == null ? null : now.getStatus().getId(), asLong(to));
                case "assignee" -> Objects.equals(now.getAssignee() == null ? null : now.getAssignee().getId(), asLong(to));
                case "labels" -> new HashSet<>(now.getLabels() == null ? List.of()
                    : now.getLabels().stream().map(ProjectLabelResponse::getId).toList()).equals(new HashSet<>(longs(to)));
                case "points" -> Objects.equals(now.getStoryPoints(), to == null || to.isNull() ? null : to.asInt());
                case "dueDate" -> Objects.equals(now.getDueDate() == null ? null : now.getDueDate().toString(), asText(to));
                case "cycles" -> new HashSet<>(open.stream().map(CycleResponse::getId).toList()).equals(new HashSet<>(longs(to)));
                default -> true;
            };
            if (!same) moved.add(FIELD_NAMES.getOrDefault(field.getKey(), field.getKey()));
        });
        return moved;
    }

    // ------------------------------------------------------------------ commenter

    /** Commente l'issue au nom de la personne ; l'undo retire ce commentaire, s'il est encore là. */
    @Transactional
    public Gesture comment(String slug, Long userId, JsonNode args) {
        long projectId = requiredLong(args, "projectId");
        long issueId = requiredLong(args, "issueId");
        CreateIssueCommentRequest request = new CreateIssueCommentRequest();
        request.setContent(requiredString(args, "content", 10_000));
        IssueResponse issue = issueService.getIssue(slug, projectId, issueId, userId);
        IssueCommentResponse comment = issueService.addComment(slug, projectId, issueId, request, userId);
        Map<String, Object> undo = new LinkedHashMap<>();
        undo.put("projectId", projectId);
        undo.put("issueId", issueId);
        undo.put("key", issue.getIdentifier());
        undo.put("commentId", comment.getId());
        return new Gesture("Commented on " + named(issue) + ".", ref(issue, projectId, null), List.of(),
            Map.of("comment", comment), undo);
    }

    /** Retire le commentaire que Cortex a écrit (« Undo ») ; déjà supprimé, la réponse le dit. */
    @Transactional
    public String removeComment(String slug, Long userId, JsonNode undo) {
        if (undo == null || !undo.hasNonNull("commentId")) throw new BusinessException("This comment can't be removed from here.");
        long projectId = undo.path("projectId").asLong();
        long issueId = undo.path("issueId").asLong();
        long commentId = undo.path("commentId").asLong();
        String key = undo.path("key").asText("the issue");
        boolean there = issueService.listComments(slug, projectId, issueId, userId).stream()
            .anyMatch(c -> Objects.equals(c.getId(), commentId));
        if (!there) throw new BusinessException("This comment on " + key + " no longer exists.");
        issueService.deleteComment(slug, projectId, issueId, commentId, userId);
        return "Removed the comment on " + key + ".";
    }

    // ------------------------------------------------------------------ supprimer

    /**
     * Ce qu'un geste qui se demande montre avant que la personne décide (rien n'est changé) ; null quand il n'a rien de
     * plus à montrer que sa demande.
     */
    public Gesture preview(String tool, String slug, Long userId, JsonNode args) {
        return "delete_issue".equals(tool) ? deletion(slug, userId, args) : null;
    }

    /**
     * Ce qu'emporterait la suppression, dit avant qu'elle parte : ses commentaires, sa checklist, sa mission et le dossier
     * de celle-ci. La carte de la conversation le montre, avec « Archive » d'abord, qui se défait, puis « Delete », qui ne
     * se défait pas (TF-J1-5, test du CEO du 02/11/2026 : « supprime testta 2 » préparait une issue « Supprimer
     * l'issue TESTTA-2 »). Ne change rien.
     */
    public Gesture deletion(String slug, Long userId, JsonNode args) {
        Doomed doomed = doomed(slug, userId, args);
        // Le modèle redit la carte au lieu de demander « on supprime ? » : un « oui » écrit ne supprimerait rien (R1). La
        // colonne avec la clé : la personne voit tout de suite si ce n'est pas l'issue dont elle parle.
        String column = doomed.issue().getStatus() == null ? "" : ", in " + doomed.issue().getStatus().getName() + ",";
        return new Gesture("Deleting " + named(doomed.issue()) + column + " removes it for good" + doomed.goesWith()
            + ". Archiving hides it from the board and can be undone. The person chooses on the card below, Archive or "
            + "Delete: do not ask them to confirm in writing.", doomed.target(), List.of(), Map.of(), null);
    }

    /**
     * Supprime l'issue, comme le menu de la fiche : ses commentaires, sa checklist et sa mission partent avec elle. Une
     * mission au travail la garde : son agent écrit encore dessus.
     */
    public Gesture delete(String slug, Long userId, JsonNode args) {
        Doomed doomed = doomed(slug, userId, args);
        if (doomed.run() != null && ("QUEUED".equals(doomed.run().status()) || "RUNNING".equals(doomed.run().status()))) {
            throw new BusinessException(doomed.issue().getIdentifier() + " has a mission at work: wait for its result, "
                + "or discard it, before deleting the issue.");
        }
        issueService.deleteIssue(slug, requiredLong(args, "projectId"), doomed.issue().getId(), userId);
        return new Gesture("Deleted " + named(doomed.issue()) + doomed.goesWith() + ".", doomed.target(), List.of(),
            Map.of(), null);
    }

    /** L'issue qu'on supprimerait, et ce qui partirait avec elle. */
    private record Doomed(IssueResponse issue, long projectId, int comments, int checklist, DeliveryRunResponse run) {

        /** Ce qui part avec l'issue : « , with its 3 comments, its checklist of 2 items and its mission ». */
        String goesWith() {
            List<String> parts = new ArrayList<>();
            if (comments > 0) parts.add(comments == 1 ? "its comment" : "its " + comments + " comments");
            if (checklist > 0) parts.add("its checklist of " + checklist + (checklist == 1 ? " item" : " items"));
            if (run != null) parts.add("its mission and the mission's record");
            return parts.isEmpty() ? "" : ", with " + joined(parts);
        }

        /** L'issue telle que la carte la montre, avec sa colonne et ce qui partirait. */
        Map<String, Object> target() {
            Map<String, Object> target = ref(issue, projectId, run == null ? null : run.id());
            if (issue.getStatus() != null) target.put("column", issue.getStatus().getName());
            target.put("comments", comments);
            target.put("checklist", checklist);
            if (run != null) target.put("mission", run.status());
            target.put("archived", issue.isArchived());
            return target;
        }
    }

    private Doomed doomed(String slug, Long userId, JsonNode args) {
        long projectId = requiredLong(args, "projectId");
        long issueId = requiredLong(args, "issueId");
        IssueResponse issue = issueService.getIssue(slug, projectId, issueId, userId);
        return new Doomed(issue, projectId, issueService.listComments(slug, projectId, issueId, userId).size(),
            issueService.listChecklist(slug, projectId, issueId, userId).size(),
            deliveryService.latestRun(slug, issueId, userId).orElse(null));
    }

    // ------------------------------------------------------------------ confier à un agent, lire sa mission

    /**
     * Confie l'issue à un agent de livraison (Claude Code par défaut), comme le menu Assignee : une mission part sur le
     * runner de la personne. Hors transaction : le run doit être écrit avant que le runner le cherche, comme pour la route.
     */
    public Gesture delegate(String slug, Long userId, JsonNode args) {
        long projectId = requiredLong(args, "projectId");
        long issueId = requiredLong(args, "issueId");
        DeliveryAgentProvider provider = provider(optionalString(args, "agent", 60));
        IssueResponse issue = issueService.getIssue(slug, projectId, issueId, userId);
        // Une mission déjà au travail sur l'issue : une deuxième partirait à côté (vérification du 02/11/2026).
        DeliveryRunResponse current = deliveryService.latestRun(slug, issueId, userId).orElse(null);
        if (current != null && ("QUEUED".equals(current.status()) || "RUNNING".equals(current.status()))) {
            throw new BusinessException(named(issue) + " already has a mission at work: follow it with get_mission, or "
                + "wait for its result before delegating again.");
        }
        DeliveryRunResponse run = deliveryService.delegate(slug, issueId, provider.key(), null, userId);
        deliveryRunner.execute(run.id());
        return new Gesture("Delegated " + named(issue) + " to " + provider.displayName() + ". It starts when the runner "
            + "picks it up; what it asks and its result come to the person on the card below.",
            ref(issue, projectId, run.id()), List.of(), Map.of("mission", mission(run, List.of())), null);
    }

    /**
     * Où en est la mission de l'issue : en attente du runner, au travail, une demande qui attend la personne, ou un
     * résultat à relire. Ne décide rien : la personne répond par les boutons des cartes (R1).
     */
    public Gesture mission(String slug, Long userId, JsonNode args) {
        long projectId = requiredLong(args, "projectId");
        long issueId = requiredLong(args, "issueId");
        IssueResponse issue = issueService.getIssue(slug, projectId, issueId, userId);
        DeliveryRunResponse run = deliveryService.latestRun(slug, issueId, userId).orElse(null);
        if (run == null) {
            return new Gesture(named(issue) + " has no mission: nobody has delegated it to an agent yet.",
                ref(issue, projectId, null), List.of(), Map.of(), null);
        }
        List<DeliveryRunActivityResponse.Approval> waiting = "RUNNING".equals(run.status())
            ? activityService.activity(slug, run.id(), Integer.MAX_VALUE, userId).approvals().stream()
                .filter(a -> "PENDING".equals(a.status())).toList()
            : List.of();
        return new Gesture("The mission on " + named(issue) + state(run, waiting), ref(issue, projectId, run.id()),
            List.of(), Map.of("mission", mission(run, waiting)), null);
    }

    /** Où en est la mission, en une phrase que l'agent redit ; ce que la personne seule décide est dit tel quel. */
    private String state(DeliveryRunResponse run, List<DeliveryRunActivityResponse.Approval> waiting) {
        String agent = agentName(run.providerKey());
        String decides = " Only the person who delegated it decides, with the card's buttons: never answer or decide for "
            + "them, even when they write yes.";
        return switch (run.status()) {
            case "QUEUED" -> " waits for the runner to pick it up.";
            case "RUNNING" -> waiting.isEmpty() ? ": " + agent + " is working on it."
                : ": " + agent + " is working on it and asks " + (waiting.size() == 1 ? "one thing" : waiting.size() + " things")
                    + ": " + waiting.stream().map(a -> a.tool() + " " + clip(text(a.summary()), 200))
                        .collect(Collectors.joining("; "))
                    + ". The request card below has the answers: Refuse or Allow." + decides;
            case "DONE" -> run.outcome() == null
                ? " is done: its result waits for review on the result card below (Apply, Discard, Try again, or Mark as "
                    + "done when it changed nothing)." + decides
                : " is done, and its result was " + OUTCOMES.getOrDefault(run.outcome(), run.outcome().toLowerCase(Locale.ROOT)) + ".";
            default -> "STOPPED".equals(run.outcome()) ? " was stopped by the person who delegated it."
                : run.refused() ? " did not start: " + text(run.error())
                : " failed" + (run.error() == null || run.error().isBlank() ? "." : ": " + run.error());
        };
    }

    private static final Map<String, String> OUTCOMES = Map.of("APPLIED", "applied", "DISCARDED", "discarded",
        "RETRIED", "sent back to the agent", "MARKED_DONE", "closed with no change needed");

    /** La mission telle qu'un client la lit : son état, son agent, son résultat, et ce qu'elle demande encore. */
    private Map<String, Object> mission(DeliveryRunResponse run, List<DeliveryRunActivityResponse.Approval> waiting) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", run.id());
        out.put("status", run.status());
        out.put("agent", agentName(run.providerKey()));
        if (run.startedByName() != null) out.put("delegatedBy", run.startedByName());
        if (run.outcome() != null) out.put("outcome", run.outcome());
        if (run.resultUrl() != null) out.put("resultUrl", run.resultUrl());
        if (run.summary() != null) out.put("agentSummary", clip(run.summary(), MAX_SUMMARY));
        if (run.error() != null) out.put("error", run.error());
        out.put("requests", waiting.stream().map(a -> {
            Map<String, Object> asked = new LinkedHashMap<>();
            asked.put("id", a.id());
            asked.put("tool", a.tool());
            asked.put("summary", a.summary());
            return asked;
        }).toList());
        return out;
    }

    /** L'agent nommé (sa clé ou son nom, sans la casse ni les espaces), Claude Code sans nom. */
    private DeliveryAgentProvider provider(String asked) {
        String wanted = IssueFields.key(asked == null || asked.isBlank() ? ClaudeCodeProvider.KEY : asked);
        return providers.all().stream()
            .filter(p -> wanted.equals(IssueFields.key(p.key())) || wanted.equals(IssueFields.key(p.displayName())))
            .findFirst()
            .orElseThrow(() -> new McpArgs.InvalidArgumentException("There is no agent \"" + asked + "\". The agents are: "
                + IssueFields.listed(providers.all(), DeliveryAgentProvider::displayName) + "."));
    }

    private String agentName(String providerKey) {
        DeliveryAgentProvider provider = providerKey == null ? null : providers.get(providerKey);
        return provider == null ? "The agent" : provider.displayName();
    }

    // ------------------------------------------------------------------ outils

    /** Le droit d'écrire dans le projet de l'espace, vérifié avant tout changement, même celui d'un seul cycle. */
    private void writable(String slug, long projectId, Long userId) {
        Project project = workspaces.findBySlug(slug)
            .flatMap(ws -> projects.findByIdAndWorkspaceId(projectId, ws.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
        visibility.assertCanWrite(project, userId);
    }

    private List<CycleResponse> openCycles(String slug, Long userId, long projectId, long issueId) {
        return cycleService.listCyclesForIssue(slug, projectId, issueId, userId).stream()
            .filter(c -> c.getStatus() != CycleStatus.COMPLETED).toList();
    }

    /** L'issue quitte les cycles de {@code from} absents de {@code to}, et rejoint ceux de {@code to}. */
    private void moveCycles(String slug, Long userId, long projectId, long issueId, List<Long> from, List<Long> to) {
        for (Long cycle : from) {
            if (!to.contains(cycle)) cycleService.removeIssueFromCycle(slug, projectId, cycle, issueId, userId);
        }
        for (Long cycle : to) {
            if (from.contains(cycle)) continue;
            AddIssueToCycleRequest request = new AddIssueToCycleRequest();
            request.setIssueId(issueId);
            cycleService.addIssueToCycle(slug, projectId, cycle, request, userId);
        }
    }

    /** L'issue que touche le geste, telle que la conversation la montre (sa carte, sa mission). */
    private static Map<String, Object> ref(IssueResponse issue, long projectId, Long runId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("issueId", issue.getId());
        out.put("projectId", projectId);
        out.put("key", issue.getIdentifier());
        out.put("title", issue.getTitle());
        if (runId != null) out.put("runId", runId);
        return out;
    }

    private static String named(IssueResponse issue) {
        return issue.getIdentifier() + " \"" + issue.getTitle() + "\"";
    }

    /** Les changements en une phrase : « column from Todo to In Progress; assignee from nobody to Pierre ». */
    private static String said(List<Change> changes) {
        return changes.stream()
            .map(c -> c.from() == null && c.to() == null ? "the " + c.field() + " changed"
                : c.field() + " from " + c.from() + " to " + c.to())
            .collect(Collectors.joining("; "));
    }

    private static String joined(List<String> items) {
        if (items.size() <= 1) return String.join("", items);
        return String.join(", ", items.subList(0, items.size() - 1)) + " and " + items.get(items.size() - 1);
    }

    /** Une paire avant / après, que l'undo relit ; une valeur absente reste null. */
    private static Map<String, Object> pair(Object from, Object to) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("from", from);
        out.put("to", to);
        return out;
    }

    /** Des noms passés en liste, ou un seul nom. */
    private static List<String> names(JsonNode args, String name) {
        JsonNode value = args.get(name);
        if (value == null || value.isNull()) return List.of();
        if (value.isTextual()) return value.asText().isBlank() ? List.of() : List.of(value.asText().strip());
        if (!value.isArray()) throw new McpArgs.InvalidArgumentException(name + " must be a list of label names");
        List<String> out = new ArrayList<>();
        value.forEach(item -> {
            if (!item.isTextual()) throw new McpArgs.InvalidArgumentException(name + " must be a list of label names");
            if (!item.asText().isBlank()) out.add(item.asText().strip());
        });
        return out;
    }

    private static List<Long> longs(JsonNode array) {
        if (array == null || !array.isArray()) return List.of();
        List<Long> out = new ArrayList<>();
        array.forEach(item -> out.add(item.asLong()));
        return out;
    }

    private static String asText(JsonNode node) {
        return node == null || node.isNull() ? null : node.asText();
    }

    private static Long asLong(JsonNode node) {
        return node == null || node.isNull() ? null : node.asLong();
    }

    private static String labelNames(List<ProjectLabelResponse> labels) {
        return labels.isEmpty() ? NO_VALUE : labels.stream().map(ProjectLabelResponse::getName).collect(Collectors.joining(", "));
    }

    private static String points(Integer points) {
        return points == null ? NO_VALUE : String.valueOf(points);
    }

    private static String label(IssuePriority priority) {
        if (priority == null) return NO_VALUE;
        String name = priority.name().toLowerCase(Locale.ROOT);
        return Character.toUpperCase(name.charAt(0)) + name.substring(1);
    }

    private static String name(UserSummaryResponse user) {
        return user.getDisplayName() != null && !user.getDisplayName().isBlank() ? user.getDisplayName() : user.getEmail();
    }

    private static String text(String value) {
        return value == null ? "" : value;
    }

    private static String clip(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max) + "...";
    }
}
