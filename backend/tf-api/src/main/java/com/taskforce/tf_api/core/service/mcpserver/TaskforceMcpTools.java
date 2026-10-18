package com.taskforce.tf_api.core.service.mcpserver;

import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalDate;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalEnum;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalInt;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalLong;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.optionalString;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.requiredLong;
import static com.taskforce.tf_api.core.service.mcpserver.McpArgs.requiredString;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.service.AnalyticsService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.SmartAssignService;
import com.taskforce.tf_api.core.service.agent.AgentService;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;

/**
 * Les outils du serveur MCP de l'instance (OSS-5.2) : lire le workspace (projets, issues, Brain OS, indicateurs),
 * commenter et faire avancer une issue, demander une recommandation d'assignation ou une réponse à Cortex.
 *
 * <p>Chaque outil appelle le même service que la route REST correspondante, avec la même personne : les droits
 * (projet privé, rôle en écriture) sont donc ceux de l'API, sans rien de propre au MCP.</p>
 */
@Component
public class TaskforceMcpTools {

    /** Plafond par défaut d'une liste rendue au modèle : assez pour choisir, pas de quoi saturer son contexte. */
    static final int DEFAULT_LIMIT = 50;
    static final int MAX_LIMIT = 200;

    private final ObjectMapper mapper;
    private final List<McpTool> tools;

    public TaskforceMcpTools(
        ObjectMapper mapper,
        ProjectService projectService,
        IssueService issueService,
        SmartAssignService smartAssignService,
        BrainSearchService brainSearchService,
        AnalyticsService analyticsService,
        AgentService agentService
    ) {
        this.mapper = mapper;
        this.tools = List.of(
            new McpTool("list_projects", "List projects",
                "List the projects of the workspace (id, name, key, status, progress).",
                schema().build(), true, "GET", args -> "projects",
                (slug, userId, args) -> {
                    var projects = projectService.listProjects(slug, userId);
                    return Map.of("total", projects.size(), "projects", projects);
                }),

            new McpTool("list_issues", "List project issues",
                "List the issues of a project (id, key, title, status, assignee, priority). Use a projectId from list_projects.",
                schema().integer("projectId", "Project id, from list_projects", true)
                    .integer("limit", "How many issues to return (default " + DEFAULT_LIMIT + ", at most " + MAX_LIMIT + ")", false)
                    .build(),
                true, "GET", args -> "projects/" + requiredLong(args, "projectId") + "/issues",
                (slug, userId, args) -> limited("issues", args,
                    () -> issueService.listIssues(slug, requiredLong(args, "projectId"), userId))),

            new McpTool("get_issue", "Get issue with context",
                "Read one issue with its context: title, full description, status, priority, assignee, due date, and the "
                    + "comment thread from oldest to newest. Call it first when you work on a task: it is the specification "
                    + "and the discussion around it.",
                schema().integer("projectId", "Project id", true).integer("issueId", "Issue id", true).build(),
                true, "GET", args -> issuePath(args),
                (slug, userId, args) -> {
                    long projectId = requiredLong(args, "projectId");
                    long issueId = requiredLong(args, "issueId");
                    var issue = issueService.getIssue(slug, projectId, issueId, userId);
                    var comments = issueService.listComments(slug, projectId, issueId, userId);
                    return Map.of("issue", issue, "commentCount", comments.size(), "comments", comments);
                }),

            new McpTool("list_issue_statuses", "List issue statuses",
                "List the issue statuses of a project (id, name, category). Use it to find the statusId for update_issue.",
                schema().integer("projectId", "Project id", true).build(),
                true, "GET", args -> "projects/" + requiredLong(args, "projectId") + "/issues/statuses",
                (slug, userId, args) -> {
                    var statuses = issueService.listStatuses(slug, requiredLong(args, "projectId"), userId);
                    return Map.of("statuses", statuses);
                }),

            new McpTool("list_my_issues", "List my issues",
                "List the issues assigned to you across the projects of the workspace (key, title, status, priority, due date).",
                schema().integer("limit", "How many issues to return (default " + DEFAULT_LIMIT + ", at most " + MAX_LIMIT + ")", false)
                    .build(),
                true, "GET", args -> "my-issues",
                (slug, userId, args) -> limited("issues", args, () -> issueService.listMyIssues(slug, userId))),

            new McpTool("workspace_kpis", "Workspace KPIs",
                "Health of the workspace: resolved issues, velocity, work in progress, issues at risk. Optionally for one project.",
                schema().integer("projectId", "Limit the indicators to one project", false).build(),
                true, "GET", args -> "analytics/kpis",
                (slug, userId, args) -> analyticsService.getKpis(slug, userId, optionalLong(args, "projectId"))),

            new McpTool("brain_search", "Search Brain OS",
                "Search the notes of the workspace's Brain OS (decisions, architecture, conventions, known issues, processes). "
                    + "Returns the most relevant notes with their content. Check it before acting.",
                schema().string("query", "What you are looking for", true)
                    .integer("topK", "How many notes to return (1 to 20)", false)
                    .string("domain", "Only notes of this domain, for example ARCHITECTURE or DECISIONS", false)
                    .build(),
                true, "POST", args -> "brain/search",
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
                false, "POST", args -> "projects/" + requiredLong(args, "projectId") + "/issues",
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
                "Update an issue: status, assignee, priority, title, description or due date. Only the fields you pass change. "
                    + "Find the statusId with list_issue_statuses.",
                schema().integer("projectId", "Project id", true)
                    .integer("issueId", "Issue id", true)
                    .integer("statusId", "New status, from list_issue_statuses", false)
                    .integer("assigneeId", "New assignee (a workspace member id)", false)
                    .priority()
                    .string("title", "New title", false)
                    .string("description", "New description, in markdown", false)
                    .string("dueDate", "New due date as YYYY-MM-DD", false)
                    .build(),
                false, "PATCH", args -> issuePath(args),
                (slug, userId, args) -> {
                    UpdateIssueRequest request = new UpdateIssueRequest();
                    request.setStatusId(optionalLong(args, "statusId"));
                    request.setAssigneeId(optionalLong(args, "assigneeId"));
                    request.setPriority(optionalEnum(args, "priority", IssuePriority.class));
                    request.setTitle(optionalString(args, "title", 500));
                    request.setDescription(optionalString(args, "description", 20_000));
                    request.setDueDate(optionalDate(args, "dueDate"));
                    if (request.getStatusId() == null && request.getAssigneeId() == null && request.getPriority() == null
                        && request.getTitle() == null && request.getDescription() == null && request.getDueDate() == null) {
                        throw new McpArgs.InvalidArgumentException("Nothing to update: pass at least one field");
                    }
                    return issueService.updateIssue(slug, requiredLong(args, "projectId"), requiredLong(args, "issueId"),
                        request, userId);
                }),

            new McpTool("add_comment", "Add comment",
                "Comment on an issue, in markdown. Leave something useful to the team: a blocking question, an assumption you "
                    + "made, a point to check in review. Do not narrate every step.",
                schema().integer("projectId", "Project id", true)
                    .integer("issueId", "Issue id", true)
                    .string("content", "The comment, in markdown (10,000 characters at most)", true)
                    .build(),
                false, "POST", args -> issuePath(args) + "/comments",
                (slug, userId, args) -> {
                    CreateIssueCommentRequest request = new CreateIssueCommentRequest();
                    request.setContent(requiredString(args, "content", 10_000));
                    return issueService.addComment(slug, requiredLong(args, "projectId"), requiredLong(args, "issueId"),
                        request, userId);
                }),

            new McpTool("smart_assign", "Recommend an assignee",
                "Recommend the best assignee for an issue (workload, skills, history), with the reasons. It does not assign: "
                    + "apply the choice with update_issue.",
                schema().integer("projectId", "Project id", true).integer("issueId", "Issue id", true).build(),
                true, "POST", args -> issuePath(args) + "/smart-assign",
                (slug, userId, args) -> smartAssignService.recommend(slug, requiredLong(args, "projectId"),
                    requiredLong(args, "issueId"), userId)),

            new McpTool("ask_cortex", "Ask Cortex",
                "Ask Cortex, the AI assistant of the workspace, grounded in its Brain OS and its projects. Returns an answer "
                    + "with the notes it relied on.",
                schema().string("message", "Your question", true).build(),
                false, "POST", args -> "assistant",
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
