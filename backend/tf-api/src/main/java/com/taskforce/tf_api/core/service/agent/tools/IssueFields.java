package com.taskforce.tf_api.core.service.agent.tools;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.taskforce.tf_api.core.dto.response.CycleResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.ProjectMemberResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.CycleStatus;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.core.service.ProjectService;

/**
 * Ce qu'un agent nomme dans une issue, résolu parmi ce qui existe dans son projet : l'assigné, les labels, le cycle,
 * la colonne, les points. Une valeur qui ne se résout pas ne s'invente pas : le problème rendu dit les choix, pour que
 * l'agent demande à la personne ou corrige. Partagé par la carte de Cortex ({@link CreateIssueTool}) et les gestes du MCP
 * TaskForce (ADR-024) : « moi » y est partout la personne qui demande, « To Do » partout la colonne « Todo ».
 */
public class IssueFields {

    /** Les points d'une estimation, comme {@code CreateIssueRequest} les accepte (0 : aucune). */
    public static final int MAX_POINTS = 100;
    /** Au-delà, la liste des choix rendue au modèle est coupée : elle doit rester lisible. */
    private static final int MAX_CHOICES = 15;

    /**
     * Les mots de la personne qui demande, lus par {@link #key} : « moi-même » et « moi même » donnent « moimeme ». Un
     * agent les recopie de la demande (« assignée à moi ») au lieu du nom de la personne.
     */
    static final Set<String> SELF = Set.of("me", "myself", "moi", "moimeme", "i", "je");

    private final ProjectService projectService;
    private final CycleService cycleService;

    public IssueFields(ProjectService projectService, CycleService cycleService) {
        this.projectService = projectService;
        this.cycleService = cycleService;
    }

    /** Une valeur nommée par l'agent, résolue parmi ce qui existe : la valeur, ou ce qu'il faut lui dire. */
    public record Found<T>(T value, String problem) {
        public static <T> Found<T> of(T value) {
            return new Found<>(value, null);
        }

        public static <T> Found<T> problem(String problem) {
            return new Found<>(null, problem);
        }

        public boolean ok() {
            return problem == null;
        }
    }

    /**
     * L'assigné, parmi les membres du projet. D'abord la personne qui demande, quand l'agent la désigne : « moi », « me »,
     * « je »… ou son propre nom (son nom, son prénom, son e-mail), sans question (rejeu de la 1.8.0, 02/11/2026). Puis
     * l'e-mail exact, le nom exact, une partie du nom ou le début de l'e-mail s'ils ne désignent qu'une personne.
     * Plusieurs : la personne choisit ; aucun : les membres. Jamais inventé.
     */
    public Found<ProjectMemberResponse> assignee(ProjectResponse project, String asked, String slug, Long userId) {
        if (asked.isEmpty()) return Found.of(null);
        List<ProjectMemberResponse> members = projectService.listMembers(slug, project.getId(), userId);
        ProjectMemberResponse me = members.stream().filter(m -> Objects.equals(userId, m.getUserId())).findFirst()
            .orElse(null);
        if (me != null && (SELF.contains(key(asked)) || ownName(me, asked))) return Found.of(me);
        if (SELF.contains(key(asked))) {
            return Found.problem("The person asking is not a member of " + project.getName() + ", so the issue can't be "
                + "assigned to them. " + (members.isEmpty() ? "The project has no member yet."
                    : "Its members are: " + listed(members, IssueFields::name) + ".")
                + " Ask the person who should take it, or leave the assignee empty.");
        }
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
            + (members.isEmpty() ? "The project has no member yet." : "Its members are: " + listed(members, IssueFields::name) + ".")
            + " Ask the person who should take it, or leave the assignee empty.");
    }

    /** Les labels, parmi ceux du projet, par leur nom exact (sans tenir compte de la casse). Jamais un nouveau label. */
    public Found<List<ProjectLabelResponse>> labels(ProjectResponse project, List<String> asked, String slug, Long userId) {
        if (asked.isEmpty()) return Found.of(List.of());
        List<ProjectLabelResponse> existing = projectService.listLabels(slug, project.getId(), userId);
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
    public Found<CycleResponse> cycle(ProjectResponse project, String asked, String slug, Long userId) {
        if (asked.isEmpty()) return Found.of(null);
        List<CycleResponse> cycles = cycleService.listCycles(slug, project.getId(), userId);
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
    public static Found<Integer> points(Object raw) {
        if (raw == null || raw.toString().trim().isEmpty()) return Found.of(null);
        int value;
        try {
            if (raw instanceof Number number) {
                if (number.doubleValue() != Math.rint(number.doubleValue())) throw new NumberFormatException();
                value = number.intValue();
            } else {
                value = Integer.parseInt(raw.toString().trim());
            }
        } catch (NumberFormatException e) {
            return Found.problem("points must be a whole number from 1 to " + MAX_POINTS + ", or none.");
        }
        if (value < 0 || value > MAX_POINTS) {
            return Found.problem("points must be a whole number from 1 to " + MAX_POINTS + ", or none.");
        }
        return Found.of(value == 0 ? null : value);
    }

    /** Le nom d'un membre, ou son e-mail quand il n'en a pas. */
    public static String name(ProjectMemberResponse member) {
        return member.getDisplayName() != null && !member.getDisplayName().isBlank() ? member.getDisplayName() : member.getEmail();
    }

    /** Une liste de choix lisible : coupée au-delà de quinze, avec le nombre de ceux qui manquent. */
    public static <T> String listed(List<T> items, Function<T, String> label) {
        String shown = items.stream().limit(MAX_CHOICES).map(label).collect(Collectors.joining(", "));
        return items.size() > MAX_CHOICES ? shown + " and " + (items.size() - MAX_CHOICES) + " more" : shown;
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    /**
     * Un nom sans la casse, les accents, les espaces ni la ponctuation : « To Do » et « todo », « Moi-même » et
     * « moimeme » se valent.
     */
    public static String key(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT)
            .replaceAll("[^\\p{L}\\p{N}]", "");
    }

    /** La personne nommée par son nom, son prénom, son e-mail ou ce qui le précède : c'est elle qui demande. */
    private static boolean ownName(ProjectMemberResponse me, String asked) {
        String wanted = key(asked);
        if (wanted.isEmpty()) return false;
        String email = lower(me.getEmail());
        String local = email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        String full = me.getDisplayName() == null ? "" : me.getDisplayName().strip();
        String first = full.isEmpty() ? "" : full.split("\\s+")[0];
        return asked.strip().equalsIgnoreCase(email) || wanted.equals(key(local)) || wanted.equals(key(full))
            || wanted.equals(key(first));
    }

    /** La première colonne de la catégorie Backlog ; sans elle, null : le service prend la colonne par défaut. */
    public static IssueStatusResponse backlog(List<IssueStatusResponse> columns) {
        return columns.stream().filter(c -> c.getCategory() == IssueStatusCategory.BACKLOG).findFirst().orElse(null);
    }

    /** La colonne par défaut du projet ; sans elle, null : le service prend la sienne. */
    public static IssueStatusResponse defaultColumn(List<IssueStatusResponse> columns) {
        return columns.stream().filter(IssueStatusResponse::isDefault).findFirst().orElse(null);
    }

    /** La colonne nommée, sans la casse, les espaces ni la ponctuation : « To Do » est la colonne « Todo ». */
    public static IssueStatusResponse named(List<IssueStatusResponse> columns, String name) {
        String wanted = key(name);
        if (wanted.isEmpty()) return null;
        return columns.stream().filter(c -> wanted.equals(key(c.getName()))).findFirst().orElse(null);
    }
}
