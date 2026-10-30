package com.taskforce.tf_api.core.service.agent;

import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.enums.NodeRefType;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.IssueCommentRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.KnowledgeEdgeRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.RequiredArgsConstructor;

/**
 * Défaire d'un geste ce que Cortex a créé (R77, séance n°13) : un projet resté vide, avec les pages que le Brain OS lui
 * a données, une issue que personne n'a commentée, ou une note sur laquelle rien ne s'appuie (ni page rangée dessous, ni
 * lien d'une autre note). Au-delà, la création ne se défait plus d'ici. La sortie de l'outil, gardée au dossier de la
 * réponse, dit ce qui a été créé.
 */
@Component
@RequiredArgsConstructor
public class CortexUndo {

    /** Les outils dont la création se défait. */
    static final Set<String> TOOLS = Set.of("create_project", "create_issue", "create_note");

    private static final Pattern PROJECT = Pattern.compile("^Project created in TaskForce: (\\S+) \"(.*)\" \\(id (\\d+)\\)\\.$",
        Pattern.DOTALL);
    private static final Pattern ISSUE = Pattern.compile("^Created ([A-Za-z0-9]+)-(\\d+) \"(.*?)\" in the project ",
        Pattern.DOTALL);
    /** La sortie de {@code create_note}, que suit parfois la valeur gardée à la place d'un domaine ou d'un type inconnu. */
    private static final Pattern NOTE = Pattern.compile("^Note created: \"(.*)\" in [A-Z_]+ \\(id (\\d+)\\)\\.",
        Pattern.DOTALL);

    private final ProjectService projectService;
    private final ProjectRepository projects;
    private final IssueService issueService;
    private final IssueRepository issues;
    private final IssueCommentRepository comments;
    private final KnowledgeNodeRepository nodes;
    private final KnowledgeEdgeRepository edges;
    private final KnowledgeService knowledge;

    public boolean handles(String tool) {
        return TOOLS.contains(tool);
    }

    /** Défait ce que la sortie de l'outil dit créé, avec les droits de la personne, et dit ce qui est défait. */
    public String undo(String tool, String output, AgentContext ctx) {
        String text = output == null ? "" : output.strip();
        return switch (tool) {
            case "create_project" -> undoProject(text, ctx);
            case "create_issue" -> undoIssue(text, ctx);
            case "create_note" -> undoNote(text, ctx);
            default -> throw new BusinessException("This action can't be undone.");
        };
    }

    private String undoProject(String output, AgentContext ctx) {
        Matcher created = PROJECT.matcher(output);
        if (!created.matches()) throw new BusinessException("This answer created no project to undo.");
        Long projectId = Long.valueOf(created.group(3));
        Project project = projects.findByIdAndWorkspaceId(projectId, ctx.workspaceId())
            .orElseThrow(() -> new BusinessException("This project no longer exists."));
        if (issues.countByProjectId(projectId) > 0) {
            throw new BusinessException(project.getIdentifier() + " has issues now: delete it from its settings if you want "
                + "it gone.");
        }
        // Le dossier du projet au Brain OS et les notes que l'ingestion y a mises ; une page ajoutée depuis le garde.
        KnowledgeNode folder = nodes.findFirstByWorkspaceIdAndRefTypeAndRefId(ctx.workspaceId(), NodeRefType.PROJECT, projectId)
            .orElse(null);
        List<KnowledgeNode> pages = folder == null ? List.of()
            : nodes.findByWorkspaceIdAndParentNodeId(ctx.workspaceId(), folder.getId());
        if (pages.stream().anyMatch(page -> !projectId.equals(page.getRefId()))) {
            throw new BusinessException("Pages were added to " + project.getIdentifier() + ": delete it from its settings if "
                + "you want it gone.");
        }
        for (KnowledgeNode page : pages) knowledge.deleteNode(ctx.slug(), page.getId(), ctx.userId());
        if (folder != null) knowledge.deleteNode(ctx.slug(), folder.getId(), ctx.userId());
        projectService.deleteProject(ctx.slug(), projectId, ctx.userId());
        return "Removed the project " + project.getIdentifier() + " \"" + project.getName() + "\""
            + (pages.isEmpty() ? "." : " and its " + pages.size() + " knowledge pages.");
    }

    private String undoIssue(String output, AgentContext ctx) {
        Matcher created = ISSUE.matcher(output);
        if (!created.find()) throw new BusinessException("This answer created no issue to undo.");
        String key = created.group(1) + "-" + created.group(2);
        Project project = projects.findByWorkspaceIdAndIdentifier(ctx.workspaceId(), created.group(1))
            .orElseThrow(() -> new BusinessException(key + " no longer exists."));
        Issue issue = issues.findByProjectIdAndSequenceNumber(project.getId(), Integer.valueOf(created.group(2)))
            .orElseThrow(() -> new BusinessException(key + " no longer exists."));
        if (comments.countByIssueId(issue.getId()) > 0) {
            throw new BusinessException(key + " has comments now: delete it from the issue if you want it gone.");
        }
        issueService.deleteIssue(ctx.slug(), project.getId(), issue.getId(), ctx.userId());
        return "Removed " + key + " \"" + issue.getTitle() + "\".";
    }

    private String undoNote(String output, AgentContext ctx) {
        Matcher created = NOTE.matcher(output);
        if (!created.find()) throw new BusinessException("This answer created no note to undo.");
        Long noteId = Long.valueOf(created.group(2));
        KnowledgeNode note = nodes.findByIdAndWorkspaceId(noteId, ctx.workspaceId())
            .orElseThrow(() -> new BusinessException("This note no longer exists."));
        String title = "\"" + note.getTitle() + "\"";
        if (!nodes.findByWorkspaceIdAndParentNodeId(ctx.workspaceId(), noteId).isEmpty()) {
            throw new BusinessException(title + " has pages under it now, so Undo would leave them behind.");
        }
        if (edges.existsByToNodeId(noteId)) {
            throw new BusinessException("Other notes link to " + title + " now, so Undo would break their links.");
        }
        knowledge.deleteNode(ctx.slug(), noteId, ctx.userId());
        return "Removed the note " + title + ".";
    }
}
