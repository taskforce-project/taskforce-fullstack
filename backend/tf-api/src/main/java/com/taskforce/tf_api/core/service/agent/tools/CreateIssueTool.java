package com.taskforce.tf_api.core.service.agent.tools;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.request.AddIssueToCycleRequest;
import com.taskforce.tf_api.core.dto.request.CreateChecklistItemRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.response.CycleResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.ProjectMemberResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.CycleStatus;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;

/**
 * Outil interne d'écriture (TF-MCP-03) : crée une issue <b>native</b> dans un projet TaskForce. C'est la cible <b>par
 * défaut</b> de « crée une issue » (le pendant interne de {@code linear__save_issue} et consorts). L'autorisation
 * d'écriture sur le projet est vérifiée par {@code IssueService}.
 *
 * <p>Le projet se désigne par sa clé ou son nom, résolu par {@link ProjectResolver}. L'issue se place dans le temps :
 * le Backlog par défaut, une autre colonne et une échéance quand le but les justifie (R48, séance n°8). La réponse dit
 * le projet et la colonne tels que le service les a écrits, pour que Cortex ne les invente pas.</p>
 *
 * <p>Dans la conversation, Cortex ne fait que la préparer : {@code AgentService} la met en attente, et la carte la crée
 * avec ce que la personne y a changé (R47, R78, séance n°13). Les étapes du travail forment la checklist de l'issue, et
 * se disent ainsi partout : la carte disait « Subtasks » et la confirmation « 2 subtasks » pour une checklist, sans
 * sous-issue (recette du 01/11/2026). {@code subtasks}, l'ancien nom du paramètre, se lit encore : une carte préparée
 * avant se crée toujours.</p>
 *
 * <p>La carte remplit aussi la priorité, l'assigné, les labels, les points et le cycle, mais seulement de ce qui existe
 * (recette du 01/11/2026) : l'assigné est un membre du projet, par son nom ou son e-mail ; les labels, ceux du projet ;
 * le cycle, l'un de ceux du projet, jamais créé. Une valeur qui ne se résout pas arrête la création et dit les choix :
 * rien n'est inventé. L'activité de l'issue garde que Cortex l'a préparée ({@code via}).</p>
 */
@Component
public class CreateIssueTool implements AgentTool {

    /** L'agent par qui passe une issue créée depuis la carte : l'activité dit « prepared by Cortex ». */
    public static final String VIA = "Cortex";

    /** Ce qu'une ligne de checklist accepte (CreateChecklistItemRequest), et combien Cortex en ajoute au plus. */
    private static final int MAX_ITEM = 500;
    private static final int MAX_ITEMS = 20;
    /** Les points d'une estimation, comme {@code CreateIssueRequest} les accepte (0 : aucune). */
    private static final int MAX_POINTS = 100;
    /** Au-delà, la liste des choix rendue au modèle est coupée : elle doit rester lisible. */
    private static final int MAX_CHOICES = 15;

    private final IssueService issueService;
    private final ProjectResolver projects;
    private final ProjectService projectService;
    private final CycleService cycleService;
    private final Clock clock;

    @Autowired
    public CreateIssueTool(IssueService issueService, ProjectResolver projects, ProjectService projectService,
                           CycleService cycleService) {
        this(issueService, projects, projectService, cycleService, Clock.systemUTC());
    }

    CreateIssueTool(IssueService issueService, ProjectResolver projects, ProjectService projectService,
                    CycleService cycleService, Clock clock) {
        this.issueService = issueService;
        this.projects = projects;
        this.projectService = projectService;
        this.cycleService = cycleService;
        this.clock = clock;
    }

    @Override public String name() { return "create_issue"; }

    @Override public String description() {
        return "Prepares an issue card the person checks and creates, with a checklist if the work has steps. "
            + "Ask first only when the project or the person is unclear.";
    }

    @Override public Map<String, Object> parametersSchema() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("project", Map.of("type", "string", "description",
            "The project's key or name, as list_projects shows it. Never a guess: ask when the request does not say."));
        properties.put("title", Map.of("type", "string", "description", "Issue title"));
        properties.put("description", Map.of("type", "string", "description", "Markdown description (optional)"));
        properties.put("priority", Map.of("type", "string", "description",
            "NONE|LOW|MEDIUM|HIGH|URGENT (optional), only when the request says how urgent it is."));
        properties.put("status", Map.of("type", "string", "description",
            "The column (optional). Default: the project's Backlog. Another one only when the goal and timing call for it."));
        properties.put("dueDate", Map.of("type", "string", "description",
            "Due date YYYY-MM-DD (optional), only when the goal or the person sets a time."));
        properties.put("checklist", Map.of("type", "array", "items", Map.of("type", "string"), "description",
            "The issue's checklist, one short line per item (optional), when the work has steps."));
        properties.put("assignee", Map.of("type", "string", "description",
            "A member of the project, by name or email (optional), only when the request names who takes it. Several match: ask which one."));
        properties.put("labels", Map.of("type", "array", "items", Map.of("type", "string"), "description",
            "Labels of the project, by name (optional), only existing ones that the request or the project calls for."));
        properties.put("points", Map.of("type", "integer", "description",
            "Estimate in points, 1 to " + MAX_POINTS + " (optional), only when the request gives one."));
        properties.put("cycle", Map.of("type", "string", "description",
            "A cycle of the project, by name (optional): the one the request names, or the active one when the work starts now."));
        return Map.of("type", "object", "properties", properties, "required", List.of("project", "title"));
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        ProjectResolver.Resolution where = projects.resolve(args.get("project"), ctx);
        if (!where.found()) return where.problem();
        ProjectResponse project = where.project();
        String title = text(args.get("title"));
        if (title.isEmpty()) return "title is missing: an issue needs a title.";

        List<IssueStatusResponse> columns = issueService.listStatuses(ctx.slug(), project.getId(), ctx.userId());
        String asked = text(args.get("status"));
        IssueStatusResponse column = asked.isEmpty() ? backlog(columns) : named(columns, asked);
        if (!asked.isEmpty() && column == null) {
            return "There is no column \"" + asked + "\" in " + project.getName() + ". Its columns are: "
                + columns.stream().map(IssueStatusResponse::getName).collect(Collectors.joining(", ")) + ".";
        }
        LocalDate today = LocalDate.now(clock);
        LocalDate due;
        try {
            String raw = text(args.get("dueDate"));
            due = raw.isEmpty() ? null : LocalDate.parse(raw);
        } catch (DateTimeParseException e) {
            return "dueDate must be a date written YYYY-MM-DD, for example " + today.plusWeeks(1) + ".";
        }
        // Un jour de marge : « aujourd'hui » n'est pas le même jour partout quand l'instance compte en UTC.
        if (due != null && due.isBefore(today.minusDays(1))) {
            return "dueDate " + due + " is in the past (today is " + today + "): choose a later date, or none.";
        }
        Found<ProjectMemberResponse> assignee = assignee(project, text(args.get("assignee")), ctx);
        if (!assignee.ok()) return assignee.problem();
        Found<List<ProjectLabelResponse>> labels = labels(project, args.get("labels"), ctx);
        if (!labels.ok()) return labels.problem();
        Found<CycleResponse> cycle = cycle(project, text(args.get("cycle")), ctx);
        if (!cycle.ok()) return cycle.problem();
        Found<Integer> points = points(args.get("points"));
        if (!points.ok()) return points.problem();

        CreateIssueRequest req = new CreateIssueRequest();
        req.setTitle(title);
        if (args.get("description") != null) req.setDescription(String.valueOf(args.get("description")));
        IssuePriority priority = parsePriority(args.get("priority"));
        if (priority != null) req.setPriority(priority);
        if (column != null) req.setStatusId(column.getId());
        if (due != null) req.setDueDate(due.toString());
        if (assignee.value() != null) req.setAssigneeId(assignee.value().getUserId());
        if (!labels.value().isEmpty()) req.setLabelIds(labels.value().stream().map(ProjectLabelResponse::getId).toList());
        req.setStoryPoints(points.value());

        IssueResponse issue = issueService.createIssue(ctx.slug(), project.getId(), req, ctx.userId(), VIA);
        List<String> checklist = checklist(args.containsKey("checklist") ? args.get("checklist") : args.get("subtasks"));
        for (String line : checklist) {
            CreateChecklistItemRequest item = new CreateChecklistItemRequest();
            item.setContent(line);
            issueService.addChecklistItem(ctx.slug(), project.getId(), issue.getId(), ctx.userId(), item);
        }
        if (cycle.value() != null) {
            AddIssueToCycleRequest inCycle = new AddIssueToCycleRequest();
            inCycle.setIssueId(issue.getId());
            cycleService.addIssueToCycle(ctx.slug(), project.getId(), cycle.value().getId(), inCycle, ctx.userId());
        }
        String projectName = issue.getProjectName() != null ? issue.getProjectName() : project.getName();
        String placed = issue.getStatus() != null ? ", in the column " + issue.getStatus().getName() : "";
        String dueText = issue.getDueDate() != null ? ", due " + issue.getDueDate() : "";
        String who = assignee.value() != null ? ", assigned to " + name(assignee.value()) : "";
        String when = cycle.value() != null ? ", in the cycle " + cycle.value().getName() : "";
        String steps = checklist.isEmpty() ? ""
            : ", with a checklist of " + checklist.size() + (checklist.size() == 1 ? " item" : " items");
        return "Created " + issue.getIdentifier() + " \"" + issue.getTitle() + "\" in the project " + projectName
            + placed + dueText + who + when + steps + ".";
    }

    /**
     * Avant la carte, ce qui compte et que seule la personne peut dire (R102 : « pas chiant à remplir ») : le projet,
     * quand la demande ne le dit pas, et la personne nommée, quand elle désigne plusieurs membres ou aucun. Cortex pose
     * alors une seule question courte au lieu de deviner. Le reste (priorité, labels, points, cycle) ne se demande
     * jamais : il reste à remplir sur la carte.
     */
    @Override public String prepare(Map<String, Object> args, AgentContext ctx) {
        ProjectResolver.Resolution where = projects.resolve(args.get("project"), ctx);
        if (!where.found()) return where.problem();
        Found<ProjectMemberResponse> assignee = assignee(where.project(), text(args.get("assignee")), ctx);
        return assignee.ok() ? null : assignee.problem();
    }

    /** Une valeur nommée par Cortex, résolue parmi ce qui existe : la valeur, ou ce qu'il faut dire au modèle. */
    record Found<T>(T value, String problem) {
        static <T> Found<T> of(T value) {
            return new Found<>(value, null);
        }

        static <T> Found<T> problem(String problem) {
            return new Found<>(null, problem);
        }

        boolean ok() {
            return problem == null;
        }
    }

    /**
     * L'assigné, parmi les membres du projet : l'e-mail exact, puis le nom exact, puis une partie du nom ou le début de
     * l'e-mail s'ils ne désignent qu'une personne. Plusieurs : la personne choisit ; aucun : les membres. Jamais inventé.
     */
    Found<ProjectMemberResponse> assignee(ProjectResponse project, String asked, AgentContext ctx) {
        if (asked.isEmpty()) return Found.of(null);
        List<ProjectMemberResponse> members = projectService.listMembers(ctx.slug(), project.getId(), ctx.userId());
        String wanted = asked.toLowerCase(Locale.ROOT);
        List<ProjectMemberResponse> byEmail = members.stream().filter(m -> wanted.equals(lower(m.getEmail()))).toList();
        if (byEmail.size() == 1) return Found.of(byEmail.get(0));
        List<ProjectMemberResponse> byName = members.stream().filter(m -> wanted.equals(lower(m.getDisplayName()))).toList();
        if (byName.size() == 1) return Found.of(byName.get(0));
        List<ProjectMemberResponse> byPart = members.stream()
            .filter(m -> lower(m.getDisplayName()).contains(wanted) || lower(m.getEmail()).startsWith(wanted))
            .toList();
        List<ProjectMemberResponse> several = byName.size() > 1 ? byName : byPart;
        if (several.size() == 1) return Found.of(several.get(0));
        if (several.size() > 1) {
            return Found.problem("Several members of " + project.getName() + " match \"" + asked + "\": "
                + listed(several, m -> name(m) + " (" + m.getEmail() + ")")
                + ". Ask the person which one; do not pick one yourself.");
        }
        return Found.problem("No member of " + project.getName() + " matches \"" + asked + "\". "
            + (members.isEmpty() ? "The project has no member yet." : "Its members are: " + listed(members, this::name) + ".")
            + " Ask the person who should take it, or leave the assignee empty.");
    }

    /** Les labels, parmi ceux du projet, par leur nom exact (sans tenir compte de la casse). Jamais un nouveau label. */
    Found<List<ProjectLabelResponse>> labels(ProjectResponse project, Object raw, AgentContext ctx) {
        List<String> asked = strings(raw);
        if (asked.isEmpty()) return Found.of(List.of());
        List<ProjectLabelResponse> existing = projectService.listLabels(ctx.slug(), project.getId(), ctx.userId());
        List<ProjectLabelResponse> found = new ArrayList<>();
        for (String name : asked) {
            ProjectLabelResponse label = existing.stream().filter(l -> name.equalsIgnoreCase(l.getName())).findFirst()
                .orElse(null);
            if (label == null) {
                return Found.problem("There is no label \"" + name + "\" in " + project.getName() + ". "
                    + (existing.isEmpty() ? "The project has no label: leave the labels empty."
                        : "Its labels are: " + listed(existing, ProjectLabelResponse::getName) + ". Use existing labels only, or none."));
            }
            if (!found.contains(label)) found.add(label);
        }
        return Found.of(found);
    }

    /** Le cycle, parmi ceux du projet, par son nom exact ; un cycle terminé ne prend plus d'issue. Jamais créé. */
    Found<CycleResponse> cycle(ProjectResponse project, String asked, AgentContext ctx) {
        if (asked.isEmpty()) return Found.of(null);
        List<CycleResponse> cycles = cycleService.listCycles(ctx.slug(), project.getId(), ctx.userId());
        CycleResponse cycle = cycles.stream().filter(c -> asked.equalsIgnoreCase(c.getName())).findFirst().orElse(null);
        List<CycleResponse> open = cycles.stream().filter(c -> c.getStatus() != CycleStatus.COMPLETED).toList();
        String choices = open.isEmpty() ? "The project has no open cycle: leave the cycle empty."
            : "Its open cycles are: " + listed(open, c -> c.getName() + (c.getStatus() == CycleStatus.ACTIVE ? " (active)" : ""))
                + ". Use one of them, or none.";
        if (cycle == null) return Found.problem("There is no cycle \"" + asked + "\" in " + project.getName() + ". " + choices);
        if (cycle.getStatus() == CycleStatus.COMPLETED) {
            return Found.problem("The cycle " + cycle.getName() + " of " + project.getName() + " is completed. " + choices);
        }
        return Found.of(cycle);
    }

    /** L'estimation : un nombre entier de 1 à 100 ; absente ou 0, aucune. */
    static Found<Integer> points(Object raw) {
        if (raw == null || text(raw).isEmpty()) return Found.of(null);
        int value;
        try {
            if (raw instanceof Number number) {
                if (number.doubleValue() != Math.rint(number.doubleValue())) throw new NumberFormatException();
                value = number.intValue();
            } else {
                value = Integer.parseInt(text(raw));
            }
        } catch (NumberFormatException e) {
            return Found.problem("points must be a whole number from 1 to " + MAX_POINTS + ", or none.");
        }
        if (value < 0 || value > MAX_POINTS) {
            return Found.problem("points must be a whole number from 1 to " + MAX_POINTS + ", or none.");
        }
        return Found.of(value == 0 ? null : value);
    }

    /** La checklist de l'issue : une ligne par étape, sans les vides, vingt au plus. */
    private static List<String> checklist(Object raw) {
        return strings(raw).stream()
            .map(item -> item.length() > MAX_ITEM ? item.substring(0, MAX_ITEM) : item)
            .limit(MAX_ITEMS)
            .toList();
    }

    /** Une liste de textes, sans les vides ; rien si ce n'est pas une liste. */
    private static List<String> strings(Object raw) {
        if (!(raw instanceof List<?> items)) return List.of();
        return items.stream()
            .filter(Objects::nonNull)
            .map(item -> item.toString().strip())
            .filter(item -> !item.isEmpty())
            .toList();
    }

    private String name(ProjectMemberResponse member) {
        return member.getDisplayName() != null && !member.getDisplayName().isBlank() ? member.getDisplayName() : member.getEmail();
    }

    private static <T> String listed(List<T> items, Function<T, String> label) {
        String shown = items.stream().limit(MAX_CHOICES).map(label).collect(Collectors.joining(", "));
        return items.size() > MAX_CHOICES ? shown + " and " + (items.size() - MAX_CHOICES) + " more" : shown;
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    /** La première colonne de la catégorie Backlog ; sans elle, null : le service prend la colonne par défaut. */
    private static IssueStatusResponse backlog(List<IssueStatusResponse> columns) {
        return columns.stream().filter(c -> c.getCategory() == IssueStatusCategory.BACKLOG).findFirst().orElse(null);
    }

    private static IssueStatusResponse named(List<IssueStatusResponse> columns, String name) {
        return columns.stream().filter(c -> name.equalsIgnoreCase(c.getName())).findFirst().orElse(null);
    }

    private static String text(Object o) {
        return o == null ? "" : o.toString().trim();
    }

    private static IssuePriority parsePriority(Object o) {
        if (o == null) return null;
        try {
            return IssuePriority.valueOf(o.toString().trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null; // valeur inconnue → priorité par défaut du service
        }
    }
}
