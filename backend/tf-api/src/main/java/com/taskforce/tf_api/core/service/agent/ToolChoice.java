package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.taskforce.tf_api.core.service.mcp.ExternalMcpTool;

/**
 * Les outils connectés qu'une demande donne au modèle (R204, R201 « chercher ») : du code, jamais une initiative du
 * modèle. Le 17/11/2026, « crée un projet dans Linear » n'a jamais reçu {@code save_project} : au-dessus de douze outils,
 * ils se classaient sur des mots anglais du message, et en français ceux de Linear restaient à égalité, dans l'ordre de
 * la liste du serveur (pièces jointes, compétences, commentaires).
 *
 * <p>Le classement lit la demande en français comme en anglais : ce qu'elle veut faire (créer, lire, modifier,
 * supprimer) et sur quoi (une issue ou une tâche, un projet, un commentaire...). Les outils du connecteur qu'elle nomme
 * passent avant les autres ; parmi eux, d'abord ceux qui font ce qu'elle dit (« crée une tâche » : {@code save_issue}),
 * puis ce qui lit la même chose, puis ce qui aide à le faire (l'équipe, qu'une issue de Linear exige). À égalité, l'ordre
 * du serveur. Le plafond reste, pour les petits modèles.</p>
 */
final class ToolChoice {

    private ToolChoice() {
    }

    /** Ce qu'une demande ou un outil fait. */
    enum Verb { CREATE, READ, UPDATE, DELETE }

    /** Ce sur quoi il porte. */
    enum Thing { ISSUE, PROJECT, COMMENT, DOCUMENT, TEAM, CYCLE, LABEL, MILESTONE, USER, STATE, WORKSPACE, ATTACHMENT }

    /** Ce qu'une demande veut : ses verbes et ses choses, lus dans ses mots. */
    record Asked(Set<Verb> verbs, Set<Thing> things) {
        /** La demande écrit-elle quelque chose (créer, modifier, supprimer) ? */
        boolean writes() {
            return verbs.contains(Verb.CREATE) || verbs.contains(Verb.UPDATE) || verbs.contains(Verb.DELETE);
        }
    }

    /** Ce que fait un outil, d'après son nom : son verbe (le premier mot), et sa chose (le dernier). */
    record Does(Set<Verb> verbs, Thing thing) {
    }

    private static final int FLAGS = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS;

    /** Les verbes d'une demande, en français et en anglais, accents et fautes courantes compris (« creer », « cree »). */
    private static final Map<Verb, Pattern> ASKED_VERBS = Map.of(
        Verb.CREATE, word("create|creates|add|adds|new|file|post|write|draft|make|cr[ée]+e?r?|cr[ée]+es|cr[ée]{2}|ajoute[rsz]?"
            + "|ajout[ée]e?|nouveau|nouvelle|nouvel|nouveaux|r[ée]dige[rz]?|[ée]cri[rst]e?|poste[rz]?|commente[rz]?|fai[st]|faire"),
        Verb.READ, word("list|lists|show|get|find|search|see|read|view|which|what|liste[rz]?|montre[rz]?|affiche[rz]?"
            + "|cherche[rz]?|trouve[rz]?|vois|voir|lis|lire|donne[rz]?|quels?|quelles?"),
        Verb.UPDATE, word("update|change|edit|modify|rename|move|set|assign|close|mark|modifie[rz]?|change[rz]?|mets|met"
            + "|mettre|d[ée]place[rz]?|renomme[rz]?|assigne[rz]?|ferme[rz]?|marque[rz]?|passe[rz]?"),
        Verb.DELETE, word("delete|remove|archive|supprime[rz]?|efface[rz]?|retire[rz]?|archive[rz]?"));

    /** Les choses qu'une demande nomme, en français et en anglais. */
    private static final Map<Thing, Pattern> ASKED_THINGS = Map.ofEntries(
        Map.entry(Thing.ISSUE, word("issues?|tickets?|tasks?|bugs?|cards?|t[âa]ches?|cartes?")),
        Map.entry(Thing.PROJECT, word("projects?|projets?")),
        Map.entry(Thing.COMMENT, word("comments?|commentaires?|commente[rz]?")),
        Map.entry(Thing.DOCUMENT, word("documents?|docs?|pages?")),
        Map.entry(Thing.TEAM, word("teams?|[ée]quipes?")),
        Map.entry(Thing.CYCLE, word("cycles?|sprints?")),
        Map.entry(Thing.LABEL, word("labels?|[ée]tiquettes?|tags?")),
        Map.entry(Thing.MILESTONE, word("milestones?|jalons?")),
        Map.entry(Thing.USER, word("users?|members?|membres?|utilisateurs?|people|personnes?")),
        Map.entry(Thing.STATE, word("status|statuses|statuts?|states?|colonnes?|columns?")),
        Map.entry(Thing.WORKSPACE, word("workspaces?|espaces?")),
        Map.entry(Thing.ATTACHMENT, word("attachments?|fichiers?|files?|pi[èe]ces?\\s+jointes?")));

    /** Le verbe d'un outil, par le premier mot de son nom. {@code save} crée ou modifie (Linear). */
    private static final Map<String, Set<Verb>> TOOL_VERBS = Map.ofEntries(
        Map.entry("create", EnumSet.of(Verb.CREATE)), Map.entry("add", EnumSet.of(Verb.CREATE)),
        Map.entry("new", EnumSet.of(Verb.CREATE)), Map.entry("insert", EnumSet.of(Verb.CREATE)),
        Map.entry("post", EnumSet.of(Verb.CREATE)), Map.entry("file", EnumSet.of(Verb.CREATE)),
        Map.entry("save", EnumSet.of(Verb.CREATE, Verb.UPDATE)), Map.entry("upsert", EnumSet.of(Verb.CREATE, Verb.UPDATE)),
        Map.entry("update", EnumSet.of(Verb.UPDATE)), Map.entry("edit", EnumSet.of(Verb.UPDATE)),
        Map.entry("modify", EnumSet.of(Verb.UPDATE)), Map.entry("change", EnumSet.of(Verb.UPDATE)),
        Map.entry("rename", EnumSet.of(Verb.UPDATE)), Map.entry("set", EnumSet.of(Verb.UPDATE)),
        Map.entry("move", EnumSet.of(Verb.UPDATE)), Map.entry("assign", EnumSet.of(Verb.UPDATE)),
        Map.entry("mark", EnumSet.of(Verb.UPDATE)), Map.entry("close", EnumSet.of(Verb.UPDATE)),
        Map.entry("reopen", EnumSet.of(Verb.UPDATE)), Map.entry("patch", EnumSet.of(Verb.UPDATE)),
        Map.entry("delete", EnumSet.of(Verb.DELETE)), Map.entry("remove", EnumSet.of(Verb.DELETE)),
        Map.entry("archive", EnumSet.of(Verb.DELETE)), Map.entry("trash", EnumSet.of(Verb.DELETE)),
        Map.entry("list", EnumSet.of(Verb.READ)), Map.entry("get", EnumSet.of(Verb.READ)),
        Map.entry("search", EnumSet.of(Verb.READ)), Map.entry("find", EnumSet.of(Verb.READ)),
        Map.entry("read", EnumSet.of(Verb.READ)), Map.entry("fetch", EnumSet.of(Verb.READ)),
        Map.entry("query", EnumSet.of(Verb.READ)), Map.entry("show", EnumSet.of(Verb.READ)),
        Map.entry("view", EnumSet.of(Verb.READ)));

    /** La chose d'un outil, par le dernier mot de son nom, au singulier. */
    private static final Map<String, Thing> TOOL_THINGS = Map.ofEntries(
        Map.entry("issue", Thing.ISSUE), Map.entry("task", Thing.ISSUE), Map.entry("ticket", Thing.ISSUE),
        Map.entry("card", Thing.ISSUE), Map.entry("project", Thing.PROJECT), Map.entry("comment", Thing.COMMENT),
        Map.entry("document", Thing.DOCUMENT), Map.entry("doc", Thing.DOCUMENT), Map.entry("page", Thing.DOCUMENT),
        Map.entry("team", Thing.TEAM), Map.entry("cycle", Thing.CYCLE), Map.entry("sprint", Thing.CYCLE),
        Map.entry("label", Thing.LABEL), Map.entry("milestone", Thing.MILESTONE), Map.entry("user", Thing.USER),
        Map.entry("member", Thing.USER), Map.entry("status", Thing.STATE), Map.entry("state", Thing.STATE),
        Map.entry("workspace", Thing.WORKSPACE), Map.entry("attachment", Thing.ATTACHMENT), Map.entry("upload", Thing.ATTACHMENT),
        Map.entry("file", Thing.ATTACHMENT));

    /**
     * Ce qu'une écriture demande souvent de connaître d'abord, et que ses lectures donnent : l'équipe (qu'une issue ou un
     * projet de Linear exige), le projet, la personne, la colonne, une étiquette, un cycle. Le poids les range entre eux.
     */
    private static final Map<Thing, Integer> HELPERS = Map.of(Thing.TEAM, 12, Thing.PROJECT, 11, Thing.USER, 10,
        Thing.STATE, 10, Thing.LABEL, 9, Thing.CYCLE, 9);

    private static Pattern word(String alternatives) {
        return Pattern.compile("(?<![\\p{L}\\p{N}])(?:" + alternatives + ")(?![\\p{L}\\p{N}])", FLAGS);
    }

    /** Ce que veut une demande, dans ses mots. */
    static Asked asked(String request) {
        Set<Verb> verbs = EnumSet.noneOf(Verb.class);
        Set<Thing> things = EnumSet.noneOf(Thing.class);
        if (request == null || request.isBlank()) return new Asked(verbs, things);
        ASKED_VERBS.forEach((verb, pattern) -> { if (pattern.matcher(request).find()) verbs.add(verb); });
        ASKED_THINGS.forEach((thing, pattern) -> { if (pattern.matcher(request).find()) things.add(thing); });
        // Commenter, c'est créer un commentaire.
        if (things.contains(Thing.COMMENT) && verbs.isEmpty()) verbs.add(Verb.CREATE);
        return new Asked(verbs, things);
    }

    /** Ce que fait un outil, d'après son nom sur son serveur ({@code save_issue}, {@code createJiraIssue}). */
    static Does does(String tool) {
        String bare = tool == null ? "" : tool.substring(tool.indexOf("__") < 0 ? 0 : tool.indexOf("__") + 2);
        String[] words = bare.replaceAll("(\\p{Ll})(\\p{Lu})", "$1_$2").toLowerCase(Locale.ROOT).split("[^a-z]+");
        List<String> kept = new ArrayList<>();
        for (String word : words) if (!word.isEmpty()) kept.add(word);
        if (kept.isEmpty()) return new Does(Set.of(), null);
        Set<Verb> verbs = TOOL_VERBS.getOrDefault(kept.get(0), Set.of());
        String last = singular(kept.get(kept.size() - 1));
        return new Does(verbs, TOOL_THINGS.get(last));
    }

    private static String singular(String word) {
        if (word.endsWith("statuses")) return "status";
        if (word.endsWith("ies") && word.length() > 4) return word.substring(0, word.length() - 3) + "y";
        if (word.endsWith("s") && !word.endsWith("ss") && !word.equals("status") && word.length() > 3) {
            return word.substring(0, word.length() - 1);
        }
        return word;
    }

    /**
     * La place d'un outil pour cette demande. Un outil du connecteur nommé : +100. Il fait ce que la demande dit, sur la même
     * chose : +30 ; il lit cette chose : +15 ; un autre geste sur elle : +4 ; il fait ce qu'elle dit sur une autre chose : +5.
     * Une écriture demandée : ce qui aide à la faire (l'équipe, le projet...) : son poids. Une liste plutôt qu'un détail : +1.
     * Chaque mot anglais du nom présent dans la demande : +1, comme avant.
     */
    static int score(AgentTool tool, String request, Asked asked, boolean named) {
        Does does = does(tool.name());
        int score = named ? 100 : 0;
        boolean verb = does.verbs().stream().anyMatch(asked.verbs()::contains);
        boolean thing = does.thing() != null && asked.things().contains(does.thing());
        boolean reads = does.verbs().contains(Verb.READ);
        if (verb && thing) score += 30;
        else if (thing && reads) score += 15;
        else if (thing) score += 4;
        else if (verb) score += 5;
        if (asked.writes() && reads && does.thing() != null) score += HELPERS.getOrDefault(does.thing(), 0);
        if (reads && tool.name().contains("__list")) score += 1;
        return score + englishWords(tool.name(), request == null ? "" : request.toLowerCase(Locale.ROOT));
    }

    /** L'ancien classement : +1 par mot du nom de l'outil (après « __ », trois lettres au moins) présent dans la demande. */
    private static int englishWords(String toolName, String lowerRequest) {
        int sep = toolName.indexOf("__");
        String bare = (sep > 0 ? toolName.substring(sep + 2) : toolName).toLowerCase(Locale.ROOT);
        int score = 0;
        for (String part : bare.split("[_-]")) {
            if (part.length() >= 3 && lowerRequest.contains(part)) score++;
        }
        return score;
    }

    /**
     * Les outils que reçoit le modèle : tous sous le plafond ; au-dessus, les {@code max} premiers du classement, l'ordre du
     * serveur départageant.
     */
    static List<AgentTool> choose(List<AgentTool> external, String request, List<TargetSystems.Named> named, int max) {
        if (max <= 0) return List.of();
        if (external.size() <= max) return external;
        Asked asked = asked(request);
        return external.stream()
            .sorted(Comparator.comparingInt((AgentTool tool) -> score(tool, request, asked, isNamed(tool, named))).reversed())
            .limit(max)
            .toList();
    }

    /** L'outil vient-il d'un connecteur que la demande nomme ? */
    static boolean isNamed(AgentTool tool, List<TargetSystems.Named> named) {
        String key = tool instanceof ExternalMcpTool external ? external.connectorKey() : TargetSystems.connectorOf(tool.name());
        return key != null && named.stream().anyMatch(n -> n.keys().contains(key));
    }
}
