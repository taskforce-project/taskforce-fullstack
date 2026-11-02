package com.taskforce.tf_api.core.service.mcpserver;

import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalDate;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalEnum;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalInt;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalLong;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalString;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.requiredBoolean;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.requiredLong;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.requiredString;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.request.UpdateChecklistItemRequest;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.service.AnalyticsService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.SmartAssignService;
import com.taskforce.tf_api.core.service.agent.AgentService;
import com.taskforce.tf_api.core.service.agent.AgentTool;
import com.taskforce.tf_api.core.service.agent.tools.IssueFields;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.core.service.mcpserver.McpTool.Need;

/**
 * Les outils du serveur MCP de l'instance (OSS-5.2) : lire le workspace (projets, issues, Brain OS, indicateurs),
 * changer une issue, la déplacer, l'assigner, la commenter, en cocher la checklist au fil du travail, la confier à un
 * agent et lire où en est sa mission, la supprimer, demander une recommandation d'assignation ou une réponse à Cortex.
 *
 * <p>Chaque outil appelle le même service que la route REST correspondante, avec la personne du jeton (le sien, ou
 * celui de la personne qui a délégué) : les droits (projet privé, rôle en écriture) sont donc ceux de l'API, sans rien
 * de propre au MCP. {@code brain_search} ne rend ainsi aucune note d'un projet privé que cette personne ne voit pas.</p>
 *
 * <p>Une seule surface d'outils (ADR-024) : chaque outil porte l'action que la table de règles juge, et les gestes
 * ({@link #CORTEX}) servent aussi à Cortex dans la conversation, au nom de la personne ({@link #forCortex}). Un geste
 * s'ajoute donc une fois, ici.</p>
 */
@Component
public class TaskforceMcpTools {

    /** Plafond par défaut d'une liste rendue au modèle : assez pour choisir, pas de quoi saturer son contexte. */
    static final int DEFAULT_LIMIT = 50;
    static final int MAX_LIMIT = 200;

    /** Les actions du contrat des règles que font les outils : lire une issue, la changer. */
    private static final String READ = "issue.read";
    private static final String UPDATE = "issue.update";
    /** L'argument qui nomme l'issue d'un geste, que TaskForce demande quand la demande ne la désigne pas (R115). */
    private static final String ISSUE = "issue";

    /**
     * Les gestes que Cortex fait dans la conversation (TF-J1-5), et créer un projet (R115, TF-J1-8). Ses lectures et la
     * carte de l'issue qu'il prépare ont encore leurs outils à lui, qui passeront ici à leur tour (ADR-024).
     */
    static final List<String> CORTEX = List.of("update_issue", "add_comment", "delegate_issue", "get_mission", "delete_issue",
        "create_project");

    private final ObjectMapper mapper;
    private final IssueGestures gestures;
    private final List<McpTool> tools;

    /**
     * {@code agentService} arrive paresseusement : Cortex reçoit ces outils ({@link #forCortex}), et {@code ask_cortex}
     * a besoin de Cortex ; le cycle se résout au premier appel.
     */
    public TaskforceMcpTools(
        ObjectMapper mapper,
        ProjectService projectService,
        IssueService issueService,
        SmartAssignService smartAssignService,
        BrainSearchService brainSearchService,
        AnalyticsService analyticsService,
        @Lazy AgentService agentService,
        IssueGestures gestures,
        ProjectGestures projectGestures
    ) {
        this.mapper = mapper;
        this.gestures = gestures;
        this.tools = List.of(
            new McpTool("list_projects", "List projects",
                "List the projects of the workspace (id, name, key, status, progress).",
                schema().build(), true, READ, "GET", args -> "projects",
                (slug, userId, args) -> {
                    var projects = projectService.listProjects(slug, userId);
                    return Map.of("total", projects.size(), "projects", projects);
                }),

            new McpTool("list_issues", "List project issues",
                "List the issues of a project (id, key, title, status, assignee, priority). Use a projectId from list_projects.",
                schema().integer("projectId", "Project id, from list_projects", true)
                    .integer("limit", "How many issues to return (default " + DEFAULT_LIMIT + ", at most " + MAX_LIMIT + ")", false)
                    .build(),
                true, READ, "GET", args -> "projects/" + requiredLong(args, "projectId") + "/issues",
                (slug, userId, args) -> limited("issues", args,
                    () -> issueService.listIssues(slug, requiredLong(args, "projectId"), userId))),

            new McpTool("get_issue", "Get issue with context",
                "Read one issue with its context: title, full description, status, priority, assignee, due date, its "
                    + "checklist (each item with its id and whether it is done), and the comment thread from oldest to newest. "
                    + "Call it first when you work on a task: it is the specification and the discussion around it.",
                schema().integer("projectId", "Project id", true).integer("issueId", "Issue id", true).build(),
                true, READ, "GET", args -> issuePath(args),
                (slug, userId, args) -> {
                    long projectId = requiredLong(args, "projectId");
                    long issueId = requiredLong(args, "issueId");
                    var issue = issueService.getIssue(slug, projectId, issueId, userId);
                    var checklist = issueService.listChecklist(slug, projectId, issueId, userId);
                    var comments = issueService.listComments(slug, projectId, issueId, userId);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("issue", issue);
                    out.put("checklist", checklist);
                    out.put("commentCount", comments.size());
                    out.put("comments", comments);
                    return out;
                }),

            new McpTool("list_issue_statuses", "List issue statuses",
                "List the issue statuses of a project (id, name, category). Use it to find the statusId for update_issue.",
                schema().integer("projectId", "Project id", true).build(),
                true, READ, "GET", args -> "projects/" + requiredLong(args, "projectId") + "/issues/statuses",
                (slug, userId, args) -> {
                    var statuses = issueService.listStatuses(slug, requiredLong(args, "projectId"), userId);
                    return Map.of("statuses", statuses);
                }),

            new McpTool("list_my_issues", "List my issues",
                "List the issues assigned to you across the projects of the workspace (key, title, status, priority, due date).",
                schema().integer("limit", "How many issues to return (default " + DEFAULT_LIMIT + ", at most " + MAX_LIMIT + ")", false)
                    .build(),
                true, READ, "GET", args -> "my-issues",
                (slug, userId, args) -> limited("issues", args, () -> issueService.listMyIssues(slug, userId))),

            new McpTool("workspace_kpis", "Workspace KPIs",
                "Health of the workspace: resolved issues, velocity, work in progress, issues at risk. Optionally for one project.",
                schema().integer("projectId", "Limit the indicators to one project", false).build(),
                true, READ, "GET", args -> "analytics/kpis",
                (slug, userId, args) -> analyticsService.getKpis(slug, userId, optionalLong(args, "projectId"))),

            new McpTool("brain_search", "Search Brain OS",
                "Search the notes of the workspace's Brain OS (decisions, architecture, conventions, known issues, processes). "
                    + "Returns the most relevant notes with their content. Check it before acting.",
                schema().string("query", "What you are looking for", true)
                    .integer("topK", "How many notes to return (1 to 20)", false)
                    .string("domain", "Only notes of this domain, for example ARCHITECTURE or DECISIONS", false)
                    .build(),
                true, "knowledge.search", "POST", args -> "brain/search",
                (slug, userId, args) -> {
                    var hits = brainSearchService.search(slug, userId, requiredString(args, "query", 1000),
                        optionalInt(args, "topK", 1, 20), optionalString(args, "domain", 60));
                    return Map.of("total", hits.size(), "hits", hits);
                }),

            new McpTool("create_issue", "Create issue",
                "Create an issue in a project. Gather the context first (get_issue, brain_search). Ids come from the list tools.",
                schema().integer("projectId", "Project id", true)
                    .string("title", "Issue title", true)
                    .string("description", "Description, in markdown", false)
                    .priority()
                    .integer("assigneeId", "Assignee (a workspace member id)", false)
                    .integer("statusId", "Status, from list_issue_statuses", false)
                    .string("dueDate", "Due date as YYYY-MM-DD", false)
                    .build(),
                false, "issue.create", "POST", args -> "projects/" + requiredLong(args, "projectId") + "/issues",
                (slug, userId, args) -> {
                    CreateIssueRequest request = new CreateIssueRequest();
                    request.setTitle(requiredString(args, "title", 500));
                    request.setDescription(optionalString(args, "description", 20_000));
                    request.setPriority(optionalEnum(args, "priority", IssuePriority.class));
                    request.setAssigneeId(optionalLong(args, "assigneeId"));
                    request.setStatusId(optionalLong(args, "statusId"));
                    request.setDueDate(optionalDate(args, "dueDate"));
                    return issueService.createIssue(slug, requiredLong(args, "projectId"), request, userId);
                }),

            new McpTool("update_issue", "Update issue",
                "Change an issue: its title, description, priority, column (move it), assignee (assign it), labels, points, "
                    + "cycle or due date. Only the fields you pass change. Name the issue by its key (issue, like TF-12), and "
                    + "the column, the assignee, the labels and the cycle by their names; \"none\" removes the assignee, the "
                    + "points, the cycle or the due date.",
                issue(schema())
                    .string("title", "New title", false)
                    .string("description", "New description, in markdown", false)
                    .priority()
                    .string("status", "The column to move it to, by name, like In Progress", false)
                    .integer("statusId", "The column's id, from list_issue_statuses, instead of status", false)
                    .string("assignee", "Who takes it: a project member's name or email; \"me\" is the person asking, "
                        + "\"none\" unassigns it", false)
                    .integer("assigneeId", "The assignee's user id, instead of assignee", false)
                    .strings("addLabels", "Labels of the project to add, by name", false)
                    .strings("removeLabels", "Labels to remove, by name", false)
                    .integer("points", "Estimate in points, 1 to " + IssueFields.MAX_POINTS + "; 0 removes it", false)
                    .string("cycle", "A cycle of the project, by name; \"none\" takes it out of its cycle", false)
                    .string("dueDate", "Due date as YYYY-MM-DD; \"none\" removes it", false)
                    .build(),
                false, UPDATE, "PATCH", args -> issuePath(args),
                (slug, userId, args) -> gestures.update(slug, userId, args))
                .needing(Need.asked(ISSUE, "Which issue should change?")),

            new McpTool("check_checklist_item", "Check a checklist item",
                "Check or uncheck one item of the issue's checklist, by its id from get_issue. Check an item when you have "
                    + "done its work, and only then: the person reads the checklist to see where the task stands.",
                schema().integer("projectId", "Project id", true)
                    .integer("issueId", "Issue id", true)
                    .integer("itemId", "Checklist item id, from get_issue", true)
                    .bool("done", "true to check the item, false to uncheck it", true)
                    .build(),
                false, UPDATE, "PATCH", args -> issuePath(args) + "/checklist/" + requiredLong(args, "itemId"),
                (slug, userId, args) -> {
                    UpdateChecklistItemRequest request = new UpdateChecklistItemRequest();
                    request.setDone(requiredBoolean(args, "done"));
                    return issueService.updateChecklistItem(slug, requiredLong(args, "projectId"),
                        requiredLong(args, "issueId"), requiredLong(args, "itemId"), userId, request);
                }),

            new McpTool("add_comment", "Add comment",
                "Comment on an issue, in markdown. Leave something useful to the team: a blocking question, an assumption you "
                    + "made, a point to check in review. Do not narrate every step.",
                issue(schema())
                    .string("content", "The comment, in markdown (10,000 characters at most)", true)
                    .build(),
                false, "comment.create", "POST", args -> issuePath(args) + "/comments",
                (slug, userId, args) -> gestures.comment(slug, userId, args))
                .needing(Need.asked(ISSUE, "Which issue should get the comment?"),
                    Need.asked("content", "What should the comment say?")),

            new McpTool("delegate_issue", "Delegate an issue to an agent",
                "Hand an issue to a coding agent (Claude Code unless you name another): a mission starts on the person's "
                    + "runner, in its own copy of the repository. What it asks and its result wait for the person.",
                issue(schema())
                    .string("agent", "The agent, by name (default: Claude Code)", false)
                    .build(),
                false, "mission.start", "POST", args -> "delivery/issues/" + requiredLong(args, "issueId") + "/delegate",
                (slug, userId, args) -> gestures.delegate(slug, userId, args))
                .needing(Need.asked(ISSUE, "Which issue should Claude Code work on?"),
                    Need.byDefault("agent", "Claude Code")),

            new McpTool("delete_issue", "Delete an issue",
                "Delete an issue for good, with its comments, its checklist and its mission: it cannot be undone. To only "
                    + "hide it from the board, archive it instead, which can be undone.",
                issue(schema()).build(),
                false, "issue.delete", "DELETE", args -> issuePath(args),
                (slug, userId, args) -> gestures.delete(slug, userId, args))
                .needing(Need.asked(ISSUE, "Which issue should be deleted?")),

            new McpTool("get_mission", "Get the mission of an issue",
                "Where the mission of an issue stands: waiting for the runner, at work, asking the person something, or done "
                    + "with a result to review. It decides nothing: the person answers on the cards.",
                issue(schema()).build(),
                true, READ, "GET", args -> "delivery/issues/" + requiredLong(args, "issueId") + "/run",
                (slug, userId, args) -> gestures.mission(slug, userId, args))
                .needing(Need.asked(ISSUE, "Which issue's mission do you mean?")),

            new McpTool("create_project", "Create a project",
                "Create a TaskForce project. Pass name only if the person gave one, and stack if they say what it is built "
                    + "with: TaskForce asks the rest.",
                schema().string("name", "The project's name, as the person gave it; leave it out when they gave none", false)
                    .string("stack", "What it is built with, when the person says it: Next.js, Spring, a mobile app", false)
                    .string("description", "A short description, from the request", false)
                    .string("identifier", "Issue prefix, 2 to 10 capitals or digits (default: from the name)", false)
                    .string("repository", "Where its code lives: \"new\" for a new GitHub repository, \"none\", or an "
                        + "existing repository as owner/name", false)
                    .string("repositoryVisibility", "For a new repository: \"private\" or \"public\"", false)
                    .build(),
                false, "project.create", "POST", args -> "projects",
                (slug, userId, args) -> projectGestures.create(slug, userId, args))
                .needing(
                    Need.askedWhen("name", "What should the project be called?", null,
                        "the request gives no name, or only what it is built with"),
                    Need.askedWhen("repository", "Where does its code live?", null,
                        "a code project (a stack is named), where TaskForce can create or link a repository"),
                    Need.askedWhen("repositoryVisibility", "Who can see the new repository?", "private",
                        "a new repository: it can't be undone from TaskForce, so its visibility is asked with it"),
                    Need.byDefault("identifier", "from the name"),
                    Need.byDefault("visibility", "the project's members only")),

            new McpTool("smart_assign", "Recommend an assignee",
                "Recommend the best assignee for an issue (workload, skills, history), with the reasons. It does not assign: "
                    + "apply the choice with update_issue.",
                schema().integer("projectId", "Project id", true).integer("issueId", "Issue id", true).build(),
                true, null, "POST", args -> issuePath(args) + "/smart-assign",
                (slug, userId, args) -> smartAssignService.recommend(slug, requiredLong(args, "projectId"),
                    requiredLong(args, "issueId"), userId)),

            new McpTool("ask_cortex", "Ask Cortex",
                "Ask Cortex, the AI assistant of the workspace, grounded in its Brain OS and its projects. Returns an answer "
                    + "with the notes it relied on.",
                schema().string("message", "Your question", true).build(),
                false, null, "POST", args -> "assistant",
                (slug, userId, args) -> {
                    AssistantAnswer answer = agentService.run(slug, userId, requiredString(args, "message", 4000));
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("answer", answer.answer());
                    out.put("mode", answer.mode());
                    out.put("sources", answer.sources() != null ? answer.sources() : List.of());
                    return out;
                })
        );
    }

    public List<McpTool> all() {
        return tools;
    }

    public Optional<McpTool> find(String name) {
        return tools.stream().filter(tool -> tool.name().equals(name)).findFirst();
    }

    /**
     * Les arguments d'un appel, avec les ids de l'issue que l'agent a nommée par sa clé : c'est sur eux que la portée
     * d'une session déléguée juge l'équivalent REST, puis que l'outil travaille.
     */
    public JsonNode resolve(String slug, Long userId, JsonNode args) {
        return gestures.withIds(slug, userId, args);
    }

    /**
     * Les gestes du MCP tels que Cortex s'en sert dans la conversation (ADR-024) : les mêmes outils, appelés dans le
     * backend au nom de la personne, et jugés par les règles de l'espace sur l'action que chacun porte.
     */
    public List<AgentTool> forCortex() {
        return tools.stream()
            .filter(tool -> CORTEX.contains(tool.name()))
            .<AgentTool>map(tool -> new CortexMcpTool(tool, gestures, mapper))
            .toList();
    }

    /**
     * L'issue d'un outil : sa clé, ou le couple projectId et issueId qu'un agent délégué connaît déjà. Une issue nommée
     * par sa colonne ou son titre (« celle qui est dans In review by AI ») se lit à l'écran ou par list_issues, qui
     * filtre par colonne ; sans issue sûre, TaskForce demande laquelle à la personne (R115).
     */
    private static SchemaBuilder issue(SchemaBuilder schema) {
        return schema.string(ISSUE, "The issue's key, like TF-12 (or projectId and issueId). By column or title: its key "
                + "is on screen or in list_issues. Unsure: leave it out, TaskForce asks", false)
            .integer("projectId", "Project id, with issueId, instead of issue", false)
            .integer("issueId", "Issue id, with projectId, instead of issue", false);
    }

    private static String issuePath(JsonNode args) {
        return "projects/" + requiredLong(args, "projectId") + "/issues/" + requiredLong(args, "issueId");
    }

    /**
     * Liste tronquée à {@code limit} éléments, avec le total pour que le modèle sache qu'il en manque. La limite est
     * validée avant la lecture : un argument invalide ne coûte aucun appel.
     */
    private static Map<String, Object> limited(String key, JsonNode args, Supplier<List<?>> read) {
        Integer requested = optionalInt(args, "limit", 1, MAX_LIMIT);
        int limit = requested != null ? requested : DEFAULT_LIMIT;
        List<?> items = read.get();
        List<?> shown = items.size() > limit ? new ArrayList<>(items.subList(0, limit)) : items;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", items.size());
        out.put("returned", shown.size());
        out.put(key, shown);
        return out;
    }

    private SchemaBuilder schema() {
        return new SchemaBuilder(mapper);
    }

    /** Schéma JSON d'un objet d'arguments, écrit sans dépendance de plus. */
    static final class SchemaBuilder {
        private final ObjectNode root;
        private final ObjectNode properties;
        private final ArrayNode required;

        SchemaBuilder(ObjectMapper mapper) {
            root = mapper.createObjectNode().put("type", "object");
            properties = root.putObject("properties");
            required = mapper.createArrayNode();
        }

        SchemaBuilder integer(String name, String description, boolean mandatory) {
            return property(name, "integer", description, mandatory);
        }

        SchemaBuilder string(String name, String description, boolean mandatory) {
            return property(name, "string", description, mandatory);
        }

        SchemaBuilder bool(String name, String description, boolean mandatory) {
            return property(name, "boolean", description, mandatory);
        }

        /** Une liste de textes (des noms). */
        SchemaBuilder strings(String name, String description, boolean mandatory) {
            ObjectNode node = properties.putObject(name).put("type", "array").put("description", description);
            node.putObject("items").put("type", "string");
            if (mandatory) required.add(name);
            return this;
        }

        SchemaBuilder priority() {
            ObjectNode node = properties.putObject("priority").put("type", "string").put("description", "Priority");
            ArrayNode values = node.putArray("enum");
            for (IssuePriority priority : IssuePriority.values()) values.add(priority.name());
            return this;
        }

        private SchemaBuilder property(String name, String type, String description, boolean mandatory) {
            properties.putObject(name).put("type", type).put("description", description);
            if (mandatory) required.add(name);
            return this;
        }

        ObjectNode build() {
            if (!required.isEmpty()) root.set("required", required);
            return root;
        }
    }
}
