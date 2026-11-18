package com.taskforce.tf_api.core.service.agent;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.ConnectorDescriptor;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;

import lombok.RequiredArgsConstructor;

/**
 * Où écrit un outil de Cortex, et quels outils une demande nomme (R204, R201 « demander »).
 *
 * <ul>
 *   <li><b>Un outil</b> écrit dans TaskForce, ou dans l'outil connecté que son nom porte ({@code linear__save_issue}
 *       écrit dans Linear). Le nom est celui du catalogue ; un serveur ajouté à la main se nomme par sa clé.</li>
 *   <li><b>Une demande</b> nomme un outil du catalogue par son nom ou sa clé, en un mot entier, la casse et les accents
 *       ignorés : « crée un projet dans linear » nomme Linear. Un nom qui est aussi un mot courant (Make, Close, Notion,
 *       Zoom...) ne compte qu'après une préposition (« dans Notion », « on Make ») : « make a task » ne nomme rien.</li>
 * </ul>
 *
 * <p>Du code seulement, sans modèle : le 17/11/2026, « crée un projet dans Linear » a créé un projet dans TaskForce, et
 * rien sur la carte ne le disait.</p>
 */
@Component
@RequiredArgsConstructor
public class TargetSystems {

    /** Le système des outils de Cortex qui n'ont pas de préfixe : TaskForce lui-même. */
    public static final String TASKFORCE = "TaskForce";

    /** Les noms que la casse ne suffit pas à dire, pour une clé que le catalogue ne connaît pas. */
    private static final Map<String, String> BRANDS = Map.of("github", "GitHub", "gitlab", "GitLab", "hubspot", "HubSpot",
        "posthog", "PostHog", "clickup", "ClickUp", "paypal", "PayPal");

    /**
     * Les noms d'outils qui sont aussi des mots courants, en anglais ou en français : ils ne comptent qu'après une
     * préposition. « monday » seul est un jour : monday.com se nomme par son nom entier.
     */
    static final Set<String> COMMON_WORDS = Set.of("make", "close", "box", "zoom", "square", "remote", "render", "clay",
        "jam", "lucid", "ramp", "railway", "gong", "mercury", "neon", "hex", "guru", "glean", "framer", "notion", "plane",
        "apollo", "fathom", "granola", "otter", "gusto");

    /** Ce qui précède un outil nommé comme un lieu : « dans Linear », « on Notion », « vers Make ». */
    private static final String PLACE = "(?:dans|sur|vers|via|avec|chez|depuis|de|du|des|d'|in|on|into|to|onto|from|with|"
        + "using|through)\\s+(?:(?:le|la|les|l'|mon|ma|mes|notre|nos|ton|ta|votre|vos|my|our|your|the)\\s*)?";

    private final ConnectorCatalog catalog;

    /** Un outil qu'une demande nomme : son nom, et les clés qui le portent (la native et son second accès, R160). */
    public record Named(String name, Set<String> keys) {
        /** Cet outil est-il le système d'un geste (« Linear ») ou le connecteur d'un outil (« linear ») ? */
        public boolean is(String system) {
            return system != null && (name.equalsIgnoreCase(system) || keys.contains(system.toLowerCase(Locale.ROOT)));
        }
    }

    /**
     * Les noms de tous les outils du catalogue, et TaskForce : les lieux qu'une phrase de Cortex peut nommer, que l'outil
     * soit connecté ou non (relecture R159 de la PR #548). Le catalogue livré, lu une fois.
     */
    static Set<String> catalogNames() {
        return CatalogNames.NAMES;
    }

    private static final class CatalogNames {
        private static final Set<String> NAMES = load();

        private static Set<String> load() {
            ConnectorCatalog catalog = new ConnectorCatalog();
            catalog.build();
            Set<String> names = new LinkedHashSet<>();
            names.add(TASKFORCE);
            for (ConnectorDescriptor connector : catalog.all()) {
                if (connector.name() != null && !connector.name().isBlank()) names.add(connector.name());
            }
            return java.util.Collections.unmodifiableSet(names);
        }
    }

    /**
     * Une phrase de Cortex nomme-t-elle cet outil : en un mot entier, la casse et les accents ignorés ; un nom qui est aussi
     * un mot courant (Close, Notion, Make...) seulement après un lieu, et avec sa majuscule : « dans Notion », pas « to
     * close the sprint ».
     */
    static boolean names(String text, String name) {
        if (text == null || text.isBlank() || name == null || name.isBlank()) return false;
        String alias = plain(name);
        if (!COMMON_WORDS.contains(alias)) return find(plain(text), alias) >= 0;
        return Pattern.compile("(?<![\\p{L}\\p{N}])(?iu:" + PLACE + ")" + Pattern.quote(name) + "(?![\\p{L}\\p{N}])")
            .matcher(text.replace('’', '\'')).find();
    }

    /** Le connecteur d'un outil externe ({@code linear} pour {@code linear__save_issue}) ; null pour un outil de TaskForce. */
    public static String connectorOf(String tool) {
        int at = tool == null ? -1 : tool.indexOf("__");
        return at > 0 ? tool.substring(0, at) : null;
    }

    /** Le système où cet outil écrit, en mots : « TaskForce », « Linear », « GitHub ». */
    public String of(String tool) {
        String key = connectorOf(tool);
        if (key == null) return TASKFORCE;
        return catalog.byKey(key).map(ConnectorDescriptor::name).orElseGet(() -> plainName(key));
    }

    /**
     * Les outils du catalogue où cette demande veut lire ou écrire, dans l'ordre où elle les nomme ; TaskForce n'en est pas
     * un. Un outil n'y est que comme lieu (« dans Linear », « de Linear », « la page Notion », « Search Notion ») d'une
     * proposition qui lit ou écrit : « the linear progress bar », « some slack », « c'est mergé sur GitHub » n'en nomment
     * aucun (relecture R159 de la PR #548).
     */
    public List<Named> namedIn(String request) {
        return said(request).places();
    }

    /**
     * Le rôle d'un outil dans une proposition : où elle écrit ou lit, d'où elle prend, sur quoi elle agit, cité, ou d'où
     * vient ce dont elle parle (« le bug remonté dans Slack », « le ticket qui est dans Linear ») : un lieu où lire pour
     * une lecture, une citation pour une écriture (second tour de la relecture R159 de la PR #548).
     */
    enum Role { DEST, SOURCE, OBJECT, MENTION, ORIGIN }

    /** Un outil cité dans une proposition, où, et son rôle. */
    private record Mention(Named tool, int at, Role role) {
    }

    /**
     * Ce qu'une demande dit des outils (relecture R159 de la PR #548) : où vont ses écritures ({@code targets}, TaskForce
     * compris quand elle le nomme, « un projet TaskForce » ; {@code implicit} quand une écriture ne dit pas où), les
     * outils où elle lit ou écrit ({@code places}, sans TaskForce), et ceux qu'elle cite seulement ({@code mentioned}).
     */
    public record Said(List<Named> targets, boolean implicit, List<Named> places, List<Named> mentioned) {
        public static final Said NOTHING = new Said(List.of(), false, List.of(), List.of());

        /**
         * L'outil où la demande voulait une écriture qui va dans ce système ; null quand elle y va comme la demande le dit,
         * quand la demande ne dit pas où elle écrit, et pour TaskForce quand une de ses écritures ne dit pas où.
         */
        public Named elsewhere(String system) {
            if (targets.isEmpty() || system == null) return null;
            if (targets.stream().anyMatch(target -> target.is(system))) return null;
            if (implicit && TASKFORCE.equalsIgnoreCase(system)) return null;
            return targets.get(0);
        }

        /** Chaque écriture de la demande dit où elle va, et aucune ne va dans TaskForce. */
        public boolean writesOnlyElsewhere() {
            return !implicit && !targets.isEmpty() && targets.stream().noneMatch(target -> target.is(TASKFORCE));
        }

        /** Une écriture de la demande va-t-elle dans cet outil ? */
        public boolean writesIn(Named tool) {
            return targets.stream().anyMatch(target -> target.name().equals(tool.name()));
        }

        /** Les outils dont la demande parle, lieux puis citations : ceux dont les outils passent d'abord au modèle. */
        public List<Named> cited() {
            Map<String, Named> cited = new LinkedHashMap<>();
            places.forEach(tool -> cited.putIfAbsent(tool.name(), tool));
            mentioned.forEach(tool -> cited.putIfAbsent(tool.name(), tool));
            return List.copyOf(cited.values());
        }
    }

    /** Ce que cette demande dit des outils, proposition par proposition. */
    public Said said(String request) {
        if (request == null || request.isBlank()) return Said.NOTHING;
        List<Named> targets = new ArrayList<>();
        boolean implicit = false;
        Map<String, Named> places = new LinkedHashMap<>();
        Map<String, Named> mentioned = new LinkedHashMap<>();
        for (Intent.Clause clause : Intent.clauses(request)) {
            boolean targeted = false;
            for (Mention mention : mentions(clause.text())) {
                boolean taskforce = TASKFORCE.equals(mention.tool().name());
                if (!taskforce) mentioned.putIfAbsent(mention.tool().name(), mention.tool());
                Role role = mention.role() != Role.ORIGIN ? mention.role()
                    : clause.does() == Intent.Does.READ ? Role.SOURCE : Role.MENTION;
                if (clause.does() == Intent.Does.NOTHING || role == Role.MENTION) continue;
                if (!taskforce) places.putIfAbsent(mention.tool().name(), mention.tool());
                if (clause.does() == Intent.Does.WRITE && role != Role.SOURCE) {
                    targeted = true;
                    if (targets.stream().noneMatch(target -> target.name().equals(mention.tool().name()))) {
                        targets.add(mention.tool());
                    }
                }
            }
            if (clause.does() == Intent.Does.WRITE && !targeted) implicit = true;
        }
        return new Said(List.copyOf(targets), implicit, List.copyOf(places.values()), List.copyOf(mentioned.values()));
    }

    /** Les outils, TaskForce compris, que cette proposition cite, dans l'ordre, chacun avec son rôle. */
    private List<Mention> mentions(String clause) {
        String said = plain(clause);
        List<Mention> found = new ArrayList<>();
        for (Alias alias : aliases()) {
            Matcher m = alias.pattern().matcher(said);
            while (m.find()) {
                Role role = roleAt(clause, said, m.start(), m.end());
                // Un mot courant (Notion, Make) ne nomme un outil cité ou objet qu'avec sa majuscule : « la notion de ».
                if (COMMON_WORDS.contains(alias.alias()) && (role == Role.MENTION || role == Role.OBJECT)
                    && !capitalized(clause, m.start())) continue;
                // En anglais, devant une chose et sans sa majuscule, un nom d'outil est un adjectif : « the linear board
                // layout » (second tour de la relecture R159) ; après la chose, en français, il la nomme : « un ticket linear ».
                if (role == Role.OBJECT && !capitalized(clause, m.start()) && adjective(said, m.start(), m.end())) continue;
                found.add(new Mention(alias.tool(), m.start(), role));
            }
        }
        found.sort((a, b) -> Integer.compare(a.at(), b.at()));
        return found;
    }

    private static boolean capitalized(String clause, int at) {
        return at < clause.length() && Character.isUpperCase(clause.charAt(at));
    }

    /** Le nom est-il à la place d'un adjectif anglais : devant une chose (« linear board »), pas après elle ? */
    private static boolean adjective(String said, int start, int end) {
        return THING_AFTER.matcher(said.substring(end)).lookingAt() && !THING_BEFORE.matcher(said.substring(0, start)).find();
    }

    /** Ce qui fait un outil d'une proposition : sa place par rapport aux prépositions, aux choses et aux verbes. */
    private static Role roleAt(String clause, String said, int start, int end) {
        String before = said.substring(0, start);
        String original = clause.substring(0, Math.min(start, clause.length()));
        if (origin(before, original)) return Role.ORIGIN;
        if (DEST_BEFORE.matcher(before).find() || ACCENT_A_BEFORE.matcher(original).find()) return Role.DEST;
        if (SOURCE_BEFORE.matcher(before).find()) return Role.SOURCE;
        // Après une chose : « un projet TaskForce », « à partir du projet Linear », « ma page Notion ».
        Matcher thing = THING_BEFORE.matcher(before);
        if (thing.find()) return phraseRole(before.substring(0, thing.start()), original.substring(0, Math.min(thing.start(),
            original.length())));
        // Avant elle, en anglais : « a Linear issue », « from the Linear project ».
        if (THING_AFTER.matcher(said.substring(end)).lookingAt()) return phraseRole(before, original);
        // L'objet d'un verbe : « Search Notion for », « regarde Linear ».
        String[] words = before.strip().split("[^\\p{L}\\p{N}]+");
        int last = words.length - 1;
        while (last >= 0 && Set.of("moi", "me", "m", "").contains(words[last])) last--;
        if (last >= 0 && Intent.isVerb(words[last])) return Role.OBJECT;
        return Role.MENTION;
    }

    /** Le rôle d'une chose qui porte le nom d'un outil : d'où elle vient, où elle va, ou ce sur quoi la phrase agit. */
    private static Role phraseRole(String before, String original) {
        if (origin(before, original)) return Role.ORIGIN;
        if (SOURCE_BEFORE.matcher(before).find()) return Role.SOURCE;
        if (DEST_BEFORE.matcher(before).find() || ACCENT_A_BEFORE.matcher(original).find()) return Role.DEST;
        return Role.OBJECT;
    }

    private static final String DET = "(?:(?:le|la|les|l'|un|une|des|ce|cet|cette|ces|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|"
        + "votre|nos|vos|leur|leurs|the|a|an|this|that|these|those|my|your|our|their)\\s*)?";
    /** Ce qui précède le lieu d'une action : « dans », « sur », « vers », « en », « au », « in », « on », « to »... */
    private static final Pattern DEST_BEFORE = Pattern.compile("(?<![\\p{L}\\p{N}])(?:dans|sur|vers|en|au|aux|chez|via|in|"
        + "on|into|onto|to|inside|within)\\s+" + DET + "$");
    /** « à », avec son accent, lu dans le texte même : sans lui, « a » est aussi un article anglais. */
    private static final Pattern ACCENT_A_BEFORE = Pattern.compile("(?<![\\p{L}\\p{N}])à\\s+" + DET + "$",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    /** Ce qui précède une source : « à partir du », « depuis », « de », « from », « based on »... */
    private static final Pattern SOURCE_BEFORE = Pattern.compile("(?<![\\p{L}\\p{N}])(?:a\\s+partir\\s+(?:de|du|des|d')|"
        + "depuis|de|du|des|d'|from|out\\s+of|based\\s+on|off)\\s*" + DET + "$");
    /**
     * Un lieu rattaché à un participe : « remonté dans », « reçue sur », « signalé par Marie sur le », « reported in »,
     * « seen in ». Lu dans le texte même, ses accents compris : « poste sur Slack » (l'impératif) écrit là, « posté sur
     * Slack » dit d'où vient la chose.
     */
    private static final Pattern ORIGIN_PARTICIPLE = Pattern.compile("(?<![\\p{L}\\p{N}])(?:"
        + "(?:remont|signal|report|rapport|post|envoy|mentionn|discut|[ée]voqu|soulev|partag|relev|not|list|publi|"
        + "d[ée]tect|trouv|enregistr|logg|cr[ée]|remarqu|constat|identifi|rep[ée]r|captur|rencontr|observ)é(?:e|s|es)?"
        + "|(?:re[çc]u|vu|lu|apparu|survenu|d[ée]crit|[ée]crit|ouvert)(?:e|s|es)?"
        + "|reported|raised|seen|saw|found|received|got|sent|posted|mentioned|discussed|flagged|logged|filed|opened|shared|"
        + "spotted|detected|noticed|described|listed|tracked|captured|created|written|noted|surfaced|(?:came|brought|"
        + "showed|popped)\\s+up)"
        + "(?:\\s+(?:hier|aujourd'hui|r[ée]cemment|d[ée]j[àa]|yesterday|today|earlier|recently|already))?"
        + "(?:\\s+(?:par|by)\\s+[\\p{L}\\p{N}'-]+(?:\\s+[\\p{L}\\p{N}'-]+)?)?"
        + "\\s+(?:dans|sur|en|au|aux|chez|via|in|on|inside|within|at)\\s+" + DET + "$",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    /** Un lieu rattaché à une relative : « le ticket qui est dans », « the bug that is in », « qui traîne sur ». */
    private static final Pattern ORIGIN_RELATIVE = Pattern.compile("(?<![\\p{L}\\p{N}])(?:qui|that|which)\\s+(?:est|sont|"
        + "etait|etaient|se\\s+trouvent?|trainent?|vit|vient|viennent|is|are|was|were|lives|sits|exists|came|comes)"
        + "(?:\\s+(?:deja|encore|toujours|already|still|now|maintenant))?"
        + "\\s+(?:dans|sur|en|au|aux|chez|via|in|on|inside|within|at)\\s+" + DET + "$");

    /** Ce qui précède un outil dit-il d'où vient la chose dont parle la proposition, plutôt qu'où elle écrit ? */
    private static boolean origin(String before, String original) {
        return ORIGIN_PARTICIPLE.matcher(original.replace('’', '\'')).find() || ORIGIN_RELATIVE.matcher(before).find();
    }

    private static final String THINGS = "(?:issues?|tickets?|taches?|tasks?|cartes?|cards?|bugs?|projets?|projects?|pages?|"
        + "documents?|docs?|commentaires?|comments?|notes?|messages?|canal|canaux|channels?|dossiers?|folders?|fichiers?|"
        + "files?|bases?|databases?|tableaux?|boards?|espaces?|workspaces?|equipes?|teams?|sprints?|cycles?|deals?|"
        + "contacts?|leads?|evenements?|events?|reunions?|meetings?|prs?|pull\\s+requests?|repos?|branches?|scenarios?|"
        + "workflows?|automatisations?|automations?)";
    private static final Pattern THING_BEFORE = Pattern.compile("(?<![\\p{L}\\p{N}])" + THINGS + "\\s+$");
    private static final Pattern THING_AFTER = Pattern.compile("\\s+" + THINGS + "(?![\\p{L}\\p{N}])");

    /** Une façon de nommer un outil, son outil, et le mot entier qui le trouve. */
    private record Alias(String alias, Named tool, Pattern pattern) {
    }

    private volatile List<Alias> aliases;

    /** Les façons de nommer chaque outil du catalogue, et TaskForce, lues une fois. */
    private List<Alias> aliases() {
        List<Alias> known = aliases;
        if (known != null) return known;
        Map<String, Set<String>> keysByName = new LinkedHashMap<>();
        Map<String, Set<String>> aliasesByName = new LinkedHashMap<>();
        for (ConnectorDescriptor connector : catalog.all()) {
            if (connector.name() == null || connector.name().isBlank()) continue;
            keysByName.computeIfAbsent(connector.name(), name -> new LinkedHashSet<>()).add(connector.key());
            aliasesByName.computeIfAbsent(connector.name(), name -> new LinkedHashSet<>()).addAll(aliases(connector));
        }
        List<Alias> built = new ArrayList<>();
        built.add(new Alias("taskforce", new Named(TASKFORCE, Set.of()), word("taskforce")));
        aliasesByName.forEach((name, names) -> {
            Named tool = new Named(name, Set.copyOf(keysByName.get(name)));
            names.forEach(alias -> built.add(new Alias(alias, tool, word(alias))));
        });
        aliases = List.copyOf(built);
        return aliases;
    }

    private static Pattern word(String alias) {
        return Pattern.compile("(?<![\\p{L}\\p{N}])" + Pattern.quote(alias) + "(?![\\p{L}\\p{N}])");
    }

    /** Les façons de nommer un outil : son nom, sa clé en mots (sans « -mcp »), sans accents ni casse. */
    private static Set<String> aliases(ConnectorDescriptor connector) {
        Set<String> aliases = new LinkedHashSet<>();
        if (connector.name() != null && !connector.name().isBlank()) aliases.add(plain(connector.name()));
        if (connector.key() != null) aliases.add(plain(connector.key().replaceFirst("-mcp$", "").replace('-', ' ')));
        aliases.removeIf(alias -> alias.length() < 3 || "monday".equals(alias));
        return aliases;
    }

    /** Où la demande nomme cet outil, ou -1 ; un mot courant ne compte qu'après une préposition. */
    private static int find(String said, String alias) {
        String word = "(?<![\\p{L}\\p{N}])" + Pattern.quote(alias) + "(?![\\p{L}\\p{N}])";
        Pattern pattern = Pattern.compile(COMMON_WORDS.contains(alias) ? "(?<![\\p{L}\\p{N}])" + PLACE + word : word,
            Pattern.UNICODE_CASE | Pattern.CASE_INSENSITIVE);
        Matcher found = pattern.matcher(said);
        return found.find() ? found.start() : -1;
    }

    /** Un texte sans accents, en minuscules, l'apostrophe typographique ramenée à la droite. */
    static String plain(String text) {
        String bare = Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return bare.replace('’', '\'').toLowerCase(Locale.ROOT);
    }

    /** Le nom d'une clé que le catalogue ne connaît pas : « custom-acme-tools » se dit « Acme Tools ». */
    static String plainName(String key) {
        String bare = key.replaceFirst("^custom-", "").replaceFirst("-mcp$", "");
        return Arrays.stream(bare.split("[-_\\s]+")).filter(word -> !word.isBlank())
            .map(word -> BRANDS.getOrDefault(word.toLowerCase(Locale.ROOT),
                word.substring(0, 1).toUpperCase(Locale.ROOT) + word.substring(1)))
            .collect(Collectors.joining(" "));
    }
}
