package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantRead;
import com.taskforce.tf_api.core.dto.response.ChecklistItemResponse;
import com.taskforce.tf_api.core.dto.response.IssueActivityResponse;
import com.taskforce.tf_api.core.dto.response.IssueCommentResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.UserSummaryResponse;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Ce que TaskForce lit d'une issue avant que Cortex la résume (test du CEO du 05/11/2026 : à « prend OPS-35 et propose
 * moi un resume dans les commentaire stp », qwen3:8b n'a rien lu et a commenté « la refonte de l'interface de connexion
 * et des mesures de sécurité renforcées », absentes d'OPS-35, qui n'est que « Itération #35 »). Un résumé vient de
 * l'issue, pas de l'espoir que le modèle appelle un outil : son titre, sa colonne, sa description, sa checklist, ses
 * commentaires et son activité sont donnés au modèle avant qu'il écrive, avec la consigne de n'utiliser qu'eux.
 *
 * <ul>
 *   <li><b>L'issue que la demande nomme</b> : sa clé (« OPS-35 », « ops 35 »), deux au plus ; sans clé, l'issue ouverte
 *       à l'écran, sauf quand la demande parle du projet ou du tableau.</li>
 *   <li><b>Rien que ce que la personne voit</b> : la clé se cherche parmi les projets qu'elle voit, chaque lecture passe
 *       par le service de la route REST, avec ses droits ; une lecture refusée ne montre rien.</li>
 *   <li><b>Un plafond</b> : une description coupée, les derniers commentaires et la dernière activité, un bloc borné.</li>
 * </ul>
 *
 * <p>Aucune transaction ne l'englobe (PC-022) : chaque service ouvre la sienne, courte, avant l'appel au modèle.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IssueMaterial {

    /** Les issues lues au plus pour une demande : « résume OPS-35 et OPS-36 ». */
    static final int MAX_ISSUES = 2;
    /** Le plafond d'une issue, environ 1 000 tokens : au-delà, le plus ancien tombe. */
    static final int MAX_CHARS = 4000;
    static final int MAX_DESCRIPTION = 1500;
    static final int MAX_COMMENTS = 8;
    static final int MAX_COMMENT = 400;
    static final int MAX_ACTIVITY = 12;
    static final int MAX_CHECKLIST = 20;

    static final String HEADER = "The issue to summarize, as TaskForce read it just now. It is all there is: summarize only "
        + "from it, never add a fact, a feature or a plan it does not state, and when it says little, say so in one "
        + "sentence.\n";
    /** Les issues jointes par la personne à une demande qui n'est pas un résumé (R123). */
    static final String ATTACHED = "Attached by the person to their request, as TaskForce read it just now. Use it as it "
        + "is: never add a fact it does not state.\n";
    /** Les issues jointes lues au plus : ce que le compositeur laisse joindre. */
    static final int MAX_ATTACHED = 3;

    /** Une clé écrite dans la demande, avec son tiret ou une espace : « OPS-35 », « ops 35 ». */
    private static final Pattern KEY = Pattern.compile("(?<![\\p{L}\\p{N}])(\\p{L}[\\p{L}\\p{N}]{0,9})[-\\s](\\d{1,9})(?![\\p{L}\\p{N}])");
    /** La demande parle du projet ou du tableau, pas de l'issue ouverte. */
    private static final Pattern BOARD = Pattern.compile("\\b(projects?|projets?|boards?|tableaux?|sprints?|cycles?|backlog)\\b",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private final ProjectRepository projects;
    private final IssueRepository issues;
    private final ProjectVisibilityGuard visibility;
    private final IssueService issueService;

    /**
     * Ce que le modèle a lu des issues (R123, la ligne grise) : le bloc, et chaque issue lue avec les commentaires donnés
     * sous le plafond, et leurs ids, où le socle cherche une issue importée d'un outil de l'entreprise (R158). Vide quand
     * aucune n'a été lue.
     */
    public record Read(String text, List<AssistantRead.IssueRead> issues, List<Long> ids) {
        public static final Read NOTHING = new Read("", List.of(), List.of());

        /** Ce qui a été lu, sans les ids des issues. */
        public Read(String text, List<AssistantRead.IssueRead> issues) {
            this(text, issues, List.of());
        }

        public boolean isEmpty() {
            return text == null || text.isEmpty();
        }
    }

    /** Le bloc des issues que la demande nomme, pour le modèle ; vide quand elle n'en nomme aucune que la personne voit. */
    public String describe(AgentContext ctx, String request) {
        return read(ctx, request, List.of(), true).text();
    }

    /**
     * Les issues que la personne a jointes à sa demande (R123), puis, pour un résumé, celles que la demande nomme : lues
     * avec ses droits, chacune une fois. Un résumé garde sa consigne (n'utiliser qu'elles) ; une pièce jointe dit qu'elle
     * vient de la personne. Rien quand aucune ne se lit.
     */
    public Read read(AgentContext ctx, String request, List<Screen> attached, boolean summarize) {
        Map<Long, Long> wanted = new LinkedHashMap<>();
        for (Screen issue : attached == null ? List.<Screen>of() : attached) {
            if (issue.issueId() != null && wanted.size() < MAX_ATTACHED) wanted.putIfAbsent(issue.issueId(), issue.projectId());
        }
        if (summarize) named(ctx, request).forEach(wanted::putIfAbsent);
        StringBuilder text = new StringBuilder();
        List<AssistantRead.IssueRead> read = new ArrayList<>();
        List<Long> ids = new ArrayList<>();
        for (Map.Entry<Long, Long> issue : wanted.entrySet()) {
            try {
                Block block = material(ctx, issue.getValue(), issue.getKey());
                text.append(block.text());
                read.add(new AssistantRead.IssueRead(block.key(), block.comments()));
                ids.add(issue.getKey());
            } catch (RuntimeException e) {
                // Une issue qu'elle ne voit pas (ou plus) : rien n'en est dit, la réponse se fait sans elle.
                log.debug("Cortex : issue {} non lue : {}", issue.getKey(), LogSafe.of(e.getMessage()));
            }
        }
        return text.isEmpty() ? Read.NOTHING : new Read((summarize ? HEADER : ATTACHED) + text, read, ids);
    }

    /**
     * Les issues que la demande nomme, id vers projet : par leur clé, parmi les projets que la personne voit ; sans clé,
     * l'issue ouverte, sauf quand la demande parle du projet ou du tableau.
     */
    Map<Long, Long> named(AgentContext ctx, String request) {
        Map<Long, Long> named = new LinkedHashMap<>();
        if (request == null || request.isBlank()) return named;
        Matcher key = KEY.matcher(request);
        while (key.find() && named.size() < MAX_ISSUES) {
            String identifier = key.group(1).toUpperCase(Locale.ROOT);
            Project project = projects.findByWorkspaceIdAndIdentifier(ctx.workspaceId(), identifier)
                .filter(p -> visibility.canView(p, ctx.userId())).orElse(null);
            if (project == null) continue;
            issues.findByProjectIdAndSequenceNumber(project.getId(), Integer.valueOf(key.group(2)))
                .map(Issue::getId)
                .ifPresent(id -> named.putIfAbsent(id, project.getId()));
        }
        Screen screen = ctx.screen();
        if (named.isEmpty() && screen.issueId() != null && !BOARD.matcher(request).find()) {
            named.put(screen.issueId(), screen.projectId());
        }
        return named;
    }

    private Block material(AgentContext ctx, Long projectId, Long issueId) {
        IssueResponse issue = issueService.getIssue(ctx.slug(), projectId, issueId, ctx.userId());
        List<ChecklistItemResponse> checklist = issueService.listChecklist(ctx.slug(), projectId, issueId, ctx.userId());
        List<IssueCommentResponse> comments = issueService.listComments(ctx.slug(), projectId, issueId, ctx.userId());
        List<IssueActivityResponse> activity = issueService.listActivity(ctx.slug(), projectId, issueId, ctx.userId());
        return block(issue, checklist, comments, activity);
    }

    /** Le bloc d'une issue, la clé de l'issue et les commentaires qu'il donne au modèle. */
    private record Block(String text, String key, int comments) {}

    /**
     * Le bloc d'une issue, sous son plafond : tant qu'il dépasse, le plus ancien commentaire, puis la plus ancienne
     * activité, tombent.
     */
    static String text(IssueResponse issue, List<ChecklistItemResponse> checklist, List<IssueCommentResponse> comments,
                       List<IssueActivityResponse> activity) {
        return block(issue, checklist, comments, activity).text();
    }

    private static Block block(IssueResponse issue, List<ChecklistItemResponse> checklist,
                               List<IssueCommentResponse> comments, List<IssueActivityResponse> activity) {
        List<IssueCommentResponse> said = new ArrayList<>(last(comments, MAX_COMMENTS));
        List<IssueActivityResponse> done = new ArrayList<>(last(activity, MAX_ACTIVITY));
        String text = text(issue, checklist, said, comments.size(), done);
        while (text.length() > MAX_CHARS && (!said.isEmpty() || !done.isEmpty())) {
            if (!said.isEmpty()) said.remove(0);
            else done.remove(0);
            text = text(issue, checklist, said, comments.size(), done);
        }
        String block = text.length() > MAX_CHARS ? text.substring(0, MAX_CHARS) + "\n" : text;
        return new Block(block, issue.getIdentifier(), said.size());
    }

    private static String text(IssueResponse issue, List<ChecklistItemResponse> checklist, List<IssueCommentResponse> said,
                               int comments, List<IssueActivityResponse> done) {
        StringBuilder sb = new StringBuilder();
        sb.append(issue.getIdentifier()).append(" \"").append(flat(issue.getTitle())).append("\"");
        List<String> facts = new ArrayList<>();
        if (issue.getStatus() != null) facts.add("in " + issue.getStatus().getName());
        facts.add(issue.getAssignee() == null ? "unassigned" : "assigned to " + name(issue.getAssignee()));
        if (issue.getPriority() != null) facts.add("priority " + issue.getPriority().name().toLowerCase(Locale.ROOT));
        if (issue.getStoryPoints() != null) facts.add(issue.getStoryPoints() + " points");
        if (issue.getDueDate() != null) facts.add("due " + issue.getDueDate());
        if (issue.getLabels() != null && !issue.getLabels().isEmpty()) {
            facts.add("labels " + issue.getLabels().stream().map(ProjectLabelResponse::getName).collect(Collectors.joining(", ")));
        }
        if (issue.isArchived()) facts.add("archived");
        sb.append(": ").append(String.join(", ", facts)).append('.');
        if (issue.getCreatedAt() != null) sb.append(" Created ").append(day(issue.getCreatedAt()));
        if (issue.getUpdatedAt() != null) sb.append(", last changed ").append(day(issue.getUpdatedAt()));
        sb.append(issue.getCreatedAt() != null ? ".\n" : "\n");
        String description = issue.getDescription() == null ? "" : issue.getDescription().strip();
        sb.append("Description: ").append(description.isEmpty() ? "none." : clip(flat(description), MAX_DESCRIPTION)).append('\n');
        if (checklist.isEmpty()) {
            sb.append("Checklist: none.\n");
        } else {
            long checked = checklist.stream().filter(ChecklistItemResponse::isDone).count();
            sb.append("Checklist, ").append(checked).append(" of ").append(checklist.size()).append(" done: ")
                .append(checklist.stream().limit(MAX_CHECKLIST)
                    .map(item -> (item.isDone() ? "[x] " : "[ ] ") + clip(flat(item.getContent()), 120))
                    .collect(Collectors.joining("; ")))
                .append(checklist.size() > MAX_CHECKLIST ? "; ..." : "").append('\n');
        }
        if (comments == 0) {
            sb.append("Comments: none.\n");
        } else {
            sb.append("Comments, oldest first").append(said.size() < comments ? " (the last " + said.size() + " of " + comments + ")" : "")
                .append(":\n");
            for (IssueCommentResponse comment : said) {
                sb.append("- ").append(comment.getAuthor() == null ? "someone" : name(comment.getAuthor()))
                    .append(comment.getVia() == null ? "" : " via " + comment.getVia())
                    .append(comment.getCreatedAt() == null ? "" : ", " + day(comment.getCreatedAt()))
                    .append(": \"").append(clip(flat(comment.getContent()), MAX_COMMENT)).append("\"\n");
            }
        }
        if (!done.isEmpty()) {
            sb.append("Activity, oldest first: ").append(done.stream().map(IssueMaterial::activity)
                .collect(Collectors.joining("; "))).append(".\n");
        }
        return sb.toString();
    }

    /** Une ligne de l'activité, dans les mots de la fiche : quand, qui, quoi. */
    private static String activity(IssueActivityResponse event) {
        String who = event.getActor() == null ? "someone" : name(event.getActor());
        if (event.getVia() != null && !event.getVia().isBlank()) who += " via " + event.getVia();
        String what = switch (event.getAction() == null ? "" : event.getAction().name()) {
            case "CREATED" -> "created it";
            case "STATUS_CHANGED" -> "moved it" + change(event);
            case "ASSIGNEE_CHANGED" -> "changed the assignee" + change(event);
            case "PRIORITY_CHANGED" -> "changed the priority" + change(event);
            case "TITLE_CHANGED" -> "changed the title";
            case "DESCRIPTION_CHANGED" -> "changed the description";
            case "LABEL_ADDED" -> "added the label " + Objects.toString(event.getNewValue(), "");
            case "LABEL_REMOVED" -> "removed the label " + Objects.toString(event.getOldValue(), "");
            case "DUE_DATE_CHANGED" -> "changed the due date" + change(event);
            case "COMMENT_ADDED" -> "commented";
            case "COMMENT_DELETED" -> "deleted a comment";
            case "COMPLETED" -> "completed it";
            case "REOPENED" -> "reopened it";
            case "CHECKLIST_CHECKED" -> "checked \"" + clip(flat(event.getNewValue()), 60) + "\"";
            case "CHECKLIST_UNCHECKED" -> "unchecked \"" + clip(flat(event.getNewValue()), 60) + "\"";
            case "PULL_REQUEST_OPENED" -> "opened a pull request";
            case "MISSION_APPLIED" -> "applied the mission's result";
            case "MISSION_DISCARDED" -> "discarded the mission's result";
            case "MISSION_RETRIED" -> "sent the mission back to its agent";
            case "MISSION_MARKED_DONE" -> "marked the mission done with no change needed";
            case "MISSION_CHANGES_ASKED" -> "asked the agent for changes";
            default -> event.getAction() == null ? "changed it" : event.getAction().name().toLowerCase(Locale.ROOT).replace('_', ' ');
        };
        return (event.getCreatedAt() == null ? "" : day(event.getCreatedAt()) + ", ") + who + " " + what.strip();
    }

    private static String change(IssueActivityResponse event) {
        String from = flat(event.getOldValue());
        String to = flat(event.getNewValue());
        if (from.isEmpty() && to.isEmpty()) return "";
        return " from " + (from.isEmpty() ? "none" : clip(from, 40)) + " to " + (to.isEmpty() ? "none" : clip(to, 40));
    }

    private static <T> List<T> last(List<T> items, int max) {
        return items.size() <= max ? items : items.subList(items.size() - max, items.size());
    }

    private static String day(LocalDateTime at) {
        return at.format(DAY);
    }

    private static String name(UserSummaryResponse user) {
        String name = user.getDisplayName();
        return name != null && !name.isBlank() ? flat(name) : Objects.toString(user.getEmail(), "someone");
    }

    private static String flat(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").strip();
    }

    private static String clip(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max).stripTrailing() + "...";
    }
}
