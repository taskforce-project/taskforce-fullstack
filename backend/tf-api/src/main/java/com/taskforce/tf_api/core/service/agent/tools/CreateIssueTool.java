package com.taskforce.tf_api.core.service.agent.tools;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

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
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;
import com.taskforce.tf_api.core.service.agent.tools.IssueFields.Found;

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
 *
 * <p>Rejeu de la 1.8.0 (02/11/2026) : « assignée à moi » faisait demander qui prendre. « Moi », « me », son propre nom
 * désignent la personne qui demande, sans question. Une colonne se lit sans la casse, les espaces ni la ponctuation
 * (« To Do » est « Todo ») ; une colonne qui n'existe pas donne la colonne par défaut du projet, et la réponse le dit,
 * au lieu d'arrêter la création.</p>
 */
@Component
public class CreateIssueTool implements AgentTool {

    /** L'agent par qui passe une issue créée depuis la carte : l'activité dit « prepared by Cortex ». */
    public static final String VIA = "Cortex";

    /** Ce qu'une ligne de checklist accepte (CreateChecklistItemRequest), et combien Cortex en ajoute au plus. */
    private static final int MAX_ITEM = 500;
    private static final int MAX_ITEMS = 20;

    private final IssueService issueService;
    private final ProjectResolver projects;
    private final CycleService cycleService;
    /** L'assigné, les labels, le cycle et la colonne, résolus comme pour les gestes du MCP TaskForce (ADR-024). */
    private final IssueFields fields;
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
        this.cycleService = cycleService;
        this.fields = new IssueFields(projectService, cycleService);
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
            "A project member by name or email (optional), only when the request names who takes it; \"me\" or \"moi\" "
                + "is the person asking. Several match: ask which one."));
        properties.put("labels", Map.of("type", "array", "items", Map.of("type", "string"), "description",
            "Labels of the project, by name (optional), only existing ones that the request or the project calls for."));
        properties.put("points", Map.of("type", "integer", "description",
            "Estimate in points, 1 to " + IssueFields.MAX_POINTS + " (optional), only when the request gives one."));
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
        IssueStatusResponse column = asked.isEmpty() ? IssueFields.backlog(columns) : IssueFields.named(columns, asked);
        // Une colonne qui n'existe pas n'arrête plus la création : la colonne par défaut du projet, et la réponse le dit.
        boolean byDefault = !asked.isEmpty() && column == null;
        if (byDefault) column = IssueFields.defaultColumn(columns);
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
        Found<ProjectMemberResponse> assignee = fields.assignee(project, text(args.get("assignee")), ctx.slug(), ctx.userId());
        if (!assignee.ok()) return assignee.problem();
        Found<List<ProjectLabelResponse>> labels = fields.labels(project, strings(args.get("labels")), ctx.slug(), ctx.userId());
        if (!labels.ok()) return labels.problem();
        Found<CycleResponse> cycle = fields.cycle(project, text(args.get("cycle")), ctx.slug(), ctx.userId());
        if (!cycle.ok()) return cycle.problem();
        Found<Integer> points = IssueFields.points(args.get("points"));
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
        String placed = issue.getStatus() == null ? ""
            : ", in the column " + issue.getStatus().getName()
                + (byDefault ? ", the project's default: it has no column \"" + asked + "\"" : "");
        String dueText = issue.getDueDate() != null ? ", due " + issue.getDueDate() : "";
        String who = assignee.value() != null ? ", assigned to " + IssueFields.name(assignee.value()) : "";
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
     *
     * <p>La carte montre le projet et l'assigné tels que le serveur les a résolus : la clé du projet, l'e-mail du
     * membre. Elle relit ces valeurs parmi les projets et les membres ; « moi » ou une partie d'un nom n'y désignaient
     * personne, et l'issue partait sans assigné (rejeu de la 1.8.0, 02/11/2026).</p>
     */
    @Override public Prepared prepare(Map<String, Object> args, AgentContext ctx) {
        ProjectResolver.Resolution where = projects.resolve(args.get("project"), ctx);
        if (!where.found()) return Prepared.ask(where.problem());
        Found<ProjectMemberResponse> assignee = fields.assignee(where.project(), text(args.get("assignee")), ctx.slug(), ctx.userId());
        if (!assignee.ok()) return Prepared.ask(assignee.problem());
        Map<String, Object> shown = new LinkedHashMap<>(args);
        if (where.project().getIdentifier() != null) shown.put("project", where.project().getIdentifier());
        if (assignee.value() != null && assignee.value().getEmail() != null) shown.put("assignee", assignee.value().getEmail());
        return Prepared.card(shown);
    }

    /** L'estimation : un nombre entier de 1 à 100 ; absente ou 0, aucune ({@link IssueFields#points}). */
    static Found<Integer> points(Object raw) {
        return IssueFields.points(raw);
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

    /** Un nom sans la casse, les accents, les espaces ni la ponctuation ({@link IssueFields#key}). */
    static String key(String value) {
        return IssueFields.key(value);
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
