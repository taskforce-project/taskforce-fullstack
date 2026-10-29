package com.taskforce.tf_api.core.service.agent.tools;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.service.IssueService;
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
 */
@Component
public class CreateIssueTool implements AgentTool {

    private final IssueService issueService;
    private final ProjectResolver projects;
    private final Clock clock;

    @Autowired
    public CreateIssueTool(IssueService issueService, ProjectResolver projects) {
        this(issueService, projects, Clock.systemUTC());
    }

    CreateIssueTool(IssueService issueService, ProjectResolver projects, Clock clock) {
        this.issueService = issueService;
        this.projects = projects;
        this.clock = clock;
    }

    @Override public String name() { return "create_issue"; }

    @Override public String description() {
        return "Creates an issue in a TaskForce project, placed in time: its column and due date follow its goal "
            + "(Backlog by default). Ask first when unsure.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of(
            "type", "object",
            "properties", Map.of(
                "project",     Map.of("type", "string", "description",
                    "The project's key or name, as list_projects shows it. Never a guess: ask when the request does not say."),
                "title",       Map.of("type", "string", "description", "Issue title"),
                "description", Map.of("type", "string", "description", "Markdown description (optional)"),
                "priority",    Map.of("type", "string", "description", "NONE|LOW|MEDIUM|HIGH|URGENT (optional)"),
                "status",      Map.of("type", "string", "description",
                    "The column (optional). Default: the project's Backlog. Another one only when the goal and timing call for it."),
                "dueDate",     Map.of("type", "string", "description",
                    "Due date YYYY-MM-DD (optional), only when the goal or the person sets a time.")
            ),
            "required", List.of("project", "title")
        );
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

        CreateIssueRequest req = new CreateIssueRequest();
        req.setTitle(title);
        if (args.get("description") != null) req.setDescription(String.valueOf(args.get("description")));
        IssuePriority priority = parsePriority(args.get("priority"));
        if (priority != null) req.setPriority(priority);
        if (column != null) req.setStatusId(column.getId());
        if (due != null) req.setDueDate(due.toString());

        IssueResponse issue = issueService.createIssue(ctx.slug(), project.getId(), req, ctx.userId());
        String projectName = issue.getProjectName() != null ? issue.getProjectName() : project.getName();
        String placed = issue.getStatus() != null ? ", in the column " + issue.getStatus().getName() : "";
        String dueText = issue.getDueDate() != null ? ", due " + issue.getDueDate() : "";
        return "Created " + issue.getIdentifier() + " \"" + issue.getTitle() + "\" in the project " + projectName
            + placed + dueText + ".";
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
