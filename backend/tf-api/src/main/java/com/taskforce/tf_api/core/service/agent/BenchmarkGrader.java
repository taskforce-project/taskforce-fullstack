package com.taskforce.tf_api.core.service.agent;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Les règles du banc des modèles (R131, séance n°19), du code seulement : la même réponse a toujours la même note. Une
 * règle regarde ce que le modèle a répondu et ce qu'il a appelé ; {@link BenchmarkSuite} les compose, cas par cas.
 *
 * <p>La règle qui compte le plus est {@link #inventsNothing} : une personne, une date, un nombre ou un nom propre que le
 * modèle n'a pas lus font rater le cas. Elle compare la réponse à tout ce que le modèle a lu : la matière du cas, la
 * question, et ce que ses outils lui ont rendu. Elle ne devine rien : elle ne voit pas une phrase fausse sans nom propre ;
 * pour celles-là, chaque cas dit ce qu'il ne faut pas écrire ({@link #doesNotSay}).</p>
 *
 * <p>Les motifs se lisent sur un texte sans accents ({@link #plain}), la casse ignorée : « tâche de fond » s'écrit
 * {@code tache de fond} dans un cas, et un modèle qui oublie un accent n'en est pas puni.</p>
 */
public final class BenchmarkGrader {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int FLAGS = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
    private static final int EXCERPT = 240;

    private BenchmarkGrader() {
    }

    /**
     * Ce que le modèle a fait : sa réponse, ses appels d'outils, et {@code reference}, tout ce qu'il a lu (la matière, la
     * question, ce que les outils lui ont rendu).
     */
    public record Seen(String answer, List<ReplayOutcome.ReplayCall> calls, String reference) {
        public Seen {
            answer = answer == null ? "" : answer;
            calls = calls == null ? List.of() : List.copyOf(calls);
            reference = reference == null ? "" : reference;
        }
    }

    /** Une règle d'un cas : ce qu'elle vérifie, si c'est vrai, ce qui a été vu. */
    @FunctionalInterface
    public interface Rule {
        EvalGrader.Check check(Seen seen);
    }

    // -------------------------------------------------------------------------
    // Ce que la réponse dit
    // -------------------------------------------------------------------------

    static Rule says(String label, String regex) {
        Pattern pattern = Pattern.compile(regex, FLAGS);
        return seen -> new EvalGrader.Check(label, pattern.matcher(plain(seen.answer())).find(), excerpt(seen.answer()));
    }

    static Rule doesNotSay(String label, String regex) {
        Pattern pattern = Pattern.compile(regex, FLAGS);
        return seen -> {
            Matcher found = pattern.matcher(plain(seen.answer()));
            boolean said = found.find();
            return new EvalGrader.Check(label, !said, said ? "wrote: " + found.group() : excerpt(seen.answer()));
        };
    }

    /**
     * Un ordre : {@code first} se dit au plus tard sur la dernière ligne qui dit {@code then}. La dernière, parce qu'un
     * plan nomme souvent la bascule avant de la faire (« préparer la bascule », puis « sauvegarder », puis « basculer »).
     */
    static Rule before(String label, String first, String then) {
        Pattern one = Pattern.compile(first, FLAGS);
        Pattern two = Pattern.compile(then, FLAGS);
        return seen -> {
            List<String> lines = plain(seen.answer()).lines().filter(line -> !line.isBlank()).toList();
            int a = -1;
            int b = -1;
            for (int i = 0; i < lines.size(); i++) {
                if (a < 0 && one.matcher(lines.get(i)).find()) a = i;
                if (two.matcher(lines.get(i)).find()) b = i;
            }
            return new EvalGrader.Check(label, a >= 0 && b >= 0 && a <= b, "lines: " + (a + 1) + " then " + (b + 1));
        };
    }

    // -------------------------------------------------------------------------
    // La forme : la langue, la longueur, les puces, le JSON
    // -------------------------------------------------------------------------

    private static final Set<String> FRENCH = Set.of("le", "la", "les", "des", "une", "du", "est", "sont", "et", "pour",
        "dans", "avec", "que", "qui", "pas", "au", "aux", "ce", "cette", "ces", "il", "elle", "nous", "vous", "sur", "par",
        "de", "en", "ne", "se", "sa", "son", "ses", "ni", "un");
    private static final Set<String> ENGLISH = Set.of("the", "of", "to", "is", "are", "was", "were", "and", "for", "with",
        "that", "this", "it", "we", "you", "not", "be", "has", "have", "will", "by", "from", "at", "in", "an", "its", "they");

    private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{N}]+(?:['-][\\p{L}\\p{N}]+)*");
    private static final Pattern BULLET = Pattern.compile("(?m)^\\s*(?:[-*\\u2022\\u2013]|\\d+[.)])\\s+");
    private static final Pattern NUMBERED = Pattern.compile("^\\s*\\d+[.)]\\s+\\S.*");
    private static final Pattern ANY_BULLET = Pattern.compile("^\\s*(?:[-*\\u2022\\u2013]|\\d+[.)])\\s+\\S.*");
    private static final Pattern EMOJI = Pattern.compile("[\\p{So}\\p{Cs}]");
    private static final Pattern ABBREVIATION = Pattern.compile("\\b(e\\.g|i\\.e|etc|cf|vs|M|Mme|Mr|Mrs|Ms|Dr)\\.");

    /** La réponse est dans cette langue : ses mots outils sont ceux de {@code language} (« fr » ou « en »), pas de l'autre. */
    static Rule inLanguage(String language) {
        boolean french = "fr".equals(language);
        return seen -> {
            int fr = 0;
            int en = 0;
            for (String word : words(plain(seen.answer()))) {
                if (FRENCH.contains(word)) fr++;
                if (ENGLISH.contains(word)) en++;
            }
            boolean passed = french ? fr > en : en > fr;
            return new EvalGrader.Check(french ? "answers in French" : "answers in English", passed,
                "French words: " + fr + ", English words: " + en);
        };
    }

    static Rule atMostWords(int max) {
        return seen -> {
            int count = wordCount(seen.answer());
            return new EvalGrader.Check("at most " + max + " words", count > 0 && count <= max, count + " words");
        };
    }

    static Rule atMostSentences(int max) {
        return seen -> {
            int count = sentences(seen.answer());
            return new EvalGrader.Check("at most " + max + (max > 1 ? " sentences" : " sentence"), count > 0 && count <= max,
                count + " sentences");
        };
    }

    static Rule noEmoji() {
        return seen -> {
            Matcher found = EMOJI.matcher(seen.answer());
            boolean said = found.find();
            return new EvalGrader.Check("no emoji", !said, said ? "wrote: " + found.group() : "none");
        };
    }

    /** Une liste de {@code min} à {@code max} puces ou numéros, et rien d'autre : ni titre, ni phrase d'introduction. */
    static Rule onlyBullets(int min, int max) {
        return seen -> {
            List<String> lines = seen.answer().lines().filter(line -> !line.isBlank()).toList();
            long items = lines.stream().filter(line -> ANY_BULLET.matcher(line).matches()).count();
            boolean passed = items == lines.size() && items >= min && items <= max;
            return new EvalGrader.Check(range(min, max, "bullets") + ", and nothing else", passed,
                items + " bullets in " + lines.size() + " lines");
        };
    }

    /** De {@code min} à {@code max} lignes, une chose par ligne, avec ou sans puce ; ni titre ni phrase d'annonce (une ligne qui finit par « : »). */
    static Rule lineItems(int min, int max) {
        return seen -> {
            List<String> lines = seen.answer().lines().filter(line -> !line.isBlank()).toList();
            boolean announced = lines.stream().anyMatch(line -> line.strip().endsWith(":"));
            return new EvalGrader.Check(range(min, max, "lines") + ", and nothing else", !announced && lines.size() >= min && lines.size() <= max,
                lines.size() + " lines");
        };
    }

    /** De {@code min} à {@code max} lignes numérotées, et rien d'autre. */
    static Rule numberedSteps(int min, int max) {
        return seen -> {
            List<String> lines = seen.answer().lines().filter(line -> !line.isBlank()).toList();
            long steps = lines.stream().filter(line -> NUMBERED.matcher(line).matches()).count();
            boolean passed = steps == lines.size() && steps >= min && steps <= max;
            return new EvalGrader.Check(range(min, max, "numbered steps") + ", and nothing else", passed,
                steps + " steps in " + lines.size() + " lines");
        };
    }

    /** Chaque ligne de la réponse tient en {@code max} mots. */
    static Rule linesOfAtMostWords(int max) {
        return seen -> {
            int longest = seen.answer().lines().filter(line -> !line.isBlank())
                .mapToInt(line -> wordCount(BULLET.matcher(line).replaceAll(""))).max().orElse(0);
            return new EvalGrader.Check("each line at most " + max + " words", longest > 0 && longest <= max,
                "longest line: " + longest + " words");
        };
    }

    /** Le nombre de mots tel qu'une personne le compte : ce qui est séparé par des blancs ; « 14:05 » et « 7.18.2 » sont un mot. */
    static int wordCount(String text) {
        int count = 0;
        for (String token : plain(text).strip().split("\\s+")) {
            if (token.codePoints().anyMatch(Character::isLetterOrDigit)) count++;
        }
        return count;
    }

    private static String range(int min, int max, String what) {
        return (min == max ? "exactly " + min : min + " to " + max) + " " + what;
    }

    private static List<String> words(String plain) {
        List<String> found = new ArrayList<>();
        Matcher word = WORD.matcher(plain.toLowerCase(Locale.ROOT));
        while (word.find()) found.add(word.group());
        return found;
    }

    /** Le nombre de phrases : une ligne ou une fin de phrase les sépare ; une puce, ou « e.g. », ne compte pas. */
    static int sentences(String answer) {
        String text = ABBREVIATION.matcher(BULLET.matcher(plain(answer)).replaceAll("")).replaceAll("$1");
        int count = 0;
        for (String part : text.split("(?<=[.!?\\u2026])\\s+|\\n+")) {
            if (part.codePoints().anyMatch(Character::isLetter)) count++;
        }
        return count;
    }

    /** Un seul objet JSON, et rien autour (un bloc de code qui l'entoure est toléré). */
    static Rule jsonOnly() {
        return seen -> new EvalGrader.Check("one JSON object and nothing else", json(seen.answer()) != null,
            excerpt(seen.answer()));
    }

    /** Un champ du JSON a l'une de ces valeurs, la casse ignorée. */
    static Rule jsonValue(String field, String... accepted) {
        return seen -> {
            JsonNode json = json(seen.answer());
            String value = json == null ? "" : json.path(field).asText("").strip();
            return new EvalGrader.Check(field + " is " + String.join(" or ", accepted),
                Arrays.stream(accepted).anyMatch(value::equalsIgnoreCase), value.isEmpty() ? "no " + field : value);
        };
    }

    /** Les labels du JSON : au moins un, trois au plus, ceux de {@code required}, et aucun hors de {@code allowed}. */
    static Rule jsonLabels(List<String> allowed, String... required) {
        Set<String> known = allowed.stream().map(label -> label.toLowerCase(Locale.ROOT)).collect(Collectors.toSet());
        String label = (required.length == 0 ? "" : "labels include " + String.join(", ", required) + "; ")
            + "1 to 3 labels, only from the project's";
        return seen -> {
            JsonNode json = json(seen.answer());
            List<String> labels = new ArrayList<>();
            if (json != null && json.path("labels").isArray()) {
                json.path("labels").forEach(node -> labels.add(node.asText("").strip().toLowerCase(Locale.ROOT)));
            }
            boolean passed = !labels.isEmpty() && labels.size() <= 3 && known.containsAll(labels)
                && Arrays.stream(required).allMatch(wanted -> labels.contains(wanted.toLowerCase(Locale.ROOT)));
            return new EvalGrader.Check(label, passed, labels.isEmpty() ? "no labels" : String.join(", ", labels));
        };
    }

    private static final Pattern ONE_FENCE = Pattern.compile("(?s)^```[\\w-]*\\s*\\n?(.*?)\\n?```$");

    private static JsonNode json(String answer) {
        String text = answer.strip();
        Matcher fence = ONE_FENCE.matcher(text);
        if (fence.matches()) text = fence.group(1).strip();
        if (!text.startsWith("{") || !text.endsWith("}")) return null;
        try {
            JsonNode node = JSON.readTree(text);
            return node.isObject() ? node : null;
        } catch (JsonProcessingException unreadable) {
            return null;
        }
    }

    // -------------------------------------------------------------------------
    // Le code : un travail pratique, lu dans le bloc que la réponse donne
    // -------------------------------------------------------------------------

    private static final Pattern FENCE = Pattern.compile("(?s)```[\\w+#.-]*[ \\t]*\\r?\\n(.*?)```");

    static Rule codeBlock() {
        return seen -> new EvalGrader.Check("gives a code block", FENCE.matcher(seen.answer()).find(), excerpt(seen.answer()));
    }

    static Rule codeHas(String label, String regex) {
        Pattern pattern = Pattern.compile(regex);
        return seen -> new EvalGrader.Check(label, pattern.matcher(code(seen.answer())).find(), excerpt(code(seen.answer())));
    }

    static Rule codeLacks(String label, String regex) {
        Pattern pattern = Pattern.compile(regex);
        return seen -> {
            Matcher found = pattern.matcher(code(seen.answer()));
            boolean said = found.find();
            return new EvalGrader.Check(label, !said, said ? "wrote: " + found.group() : excerpt(code(seen.answer())));
        };
    }

    /** Ce que la réponse donne comme code : ses blocs ; à défaut, tout, pour que la règle du bloc soit seule à échouer. */
    static String code(String answer) {
        StringBuilder code = new StringBuilder();
        Matcher fence = FENCE.matcher(answer);
        while (fence.find()) code.append(fence.group(1)).append('\n');
        return code.isEmpty() ? answer : code.toString();
    }

    // -------------------------------------------------------------------------
    // Les outils
    // -------------------------------------------------------------------------

    /** Un appel de {@code tool} dont chaque argument nommé correspond à son motif : {@code calls(label, tool, nom, motif, ...)}. */
    static Rule calls(String label, String tool, String... pairs) {
        Map<String, Pattern> wanted = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) wanted.put(pairs[i], Pattern.compile(pairs[i + 1], FLAGS));
        return seen -> {
            List<ReplayOutcome.ReplayCall> same = seen.calls().stream().filter(call -> call.tool().equals(tool)).toList();
            boolean passed = same.stream().anyMatch(call -> matches(wanted, call.arguments()));
            return new EvalGrader.Check(label, passed, same.isEmpty()
                ? "called: " + called(seen)
                : "arguments: " + same.stream().map(ReplayOutcome.ReplayCall::arguments).collect(Collectors.joining(" | ")));
        };
    }

    static Rule neverCalls(String... tools) {
        Set<String> forbidden = Set.of(tools);
        return seen -> new EvalGrader.Check("does not call " + String.join(", ", tools),
            seen.calls().stream().noneMatch(call -> forbidden.contains(call.tool())), "called: " + called(seen));
    }

    /**
     * R116 : la réponse n'annonce aucune action qu'aucun outil du rejeu n'a faite. Le rejeu la corrige déjà comme une vraie
     * réponse : une phrase retirée laisse le bloc de TaskForce, et ce bloc suffit à faire rater la règle.
     */
    static Rule claimsOnlyWhatItDid() {
        return seen -> {
            List<ActionClaimCheck.Claim> claims = ActionClaimCheck.unbacked(seen.answer(), seen.calls().stream()
                .map(call -> new ActionClaimCheck.Ran(call.tool(), call.status())).toList());
            boolean corrected = seen.answer().contains(ActionClaimCheck.MARKER);
            String detail = corrected ? "TaskForce had to correct it: " + excerpt(seen.answer())
                : claims.isEmpty() ? excerpt(seen.answer())
                : "claims: " + claims.stream().map(ActionClaimCheck.Claim::sentence).collect(Collectors.joining(" | "));
            return new EvalGrader.Check("claims no action that no tool did", claims.isEmpty() && !corrected, detail);
        };
    }

    private static String called(Seen seen) {
        return seen.calls().isEmpty() ? "no tool"
            : seen.calls().stream().map(ReplayOutcome.ReplayCall::tool).collect(Collectors.joining(", "));
    }

    private static boolean matches(Map<String, Pattern> wanted, String argsJson) {
        JsonNode args;
        try {
            args = JSON.readTree(argsJson == null || argsJson.isBlank() ? "{}" : argsJson);
        } catch (JsonProcessingException unreadable) {
            return false;
        }
        for (Map.Entry<String, Pattern> entry : wanted.entrySet()) {
            JsonNode value = args.path(entry.getKey());
            if (value.isMissingNode() || value.isNull()) return false;
            if (!entry.getValue().matcher(plain(value.isValueNode() ? value.asText() : value.toString()).strip()).find()) {
                return false;
            }
        }
        return true;
    }

    // -------------------------------------------------------------------------
    // Ce que le modèle invente
    // -------------------------------------------------------------------------

    /** La réponse ne contient ni personne, ni date, ni nombre, ni nom propre que le modèle n'a pas lus. */
    static Rule inventsNothing(String... alsoAllowed) {
        return seen -> {
            List<String> invented = inventions(seen.answer(), seen.reference(), List.of(alsoAllowed));
            return new EvalGrader.Check("invents no person, date, number or name", invented.isEmpty(),
                invented.isEmpty() ? "nothing added" : "invented: " + String.join(", ", invented));
        };
    }

    private static final Map<String, Integer> MONTHS = months();
    private static final String MONTH_WORDS = String.join("|", MONTHS.keySet());
    private static final Pattern ISO_DATE = Pattern.compile("\\b\\d{4}-(\\d{2})-(\\d{2})\\b");
    private static final Pattern SLASH_DATE = Pattern.compile("\\b(\\d{1,2})/(\\d{1,2})(?:/\\d{2,4})?\\b");
    private static final Pattern DAY_MONTH = Pattern.compile("\\b(\\d{1,2})(?:er|st|nd|rd|th)?\\s+(?:of\\s+)?(" + MONTH_WORDS
        + ")\\b\\.?(?:\\s+\\d{4}\\b)?", FLAGS);
    private static final Pattern MONTH_DAY = Pattern.compile("\\b(" + MONTH_WORDS + ")\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![:h\\d])"
        + "(?:,?\\s+\\d{4}\\b)?", FLAGS);
    /** Les mois seuls : en français tels quels ; en anglais avec leur majuscule (« may » et « march » sont aussi des verbes). */
    private static final Pattern FRENCH_MONTH = Pattern.compile("\\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|"
        + "octobre|novembre|decembre)\\b", FLAGS);
    private static final Pattern ENGLISH_MONTH = Pattern.compile("\\b(January|February|March|April|May|June|July|August|September|"
        + "October|November|December)\\b");
    private static final List<String> WEEK_FR = List.of("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche");
    private static final List<String> WEEK_EN = List.of("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday");
    private static final Pattern WEEKDAY = Pattern.compile("\\b(" + String.join("|", WEEK_FR) + "|" + String.join("|", WEEK_EN) + ")\\b", FLAGS);
    /** Une date dite en mots : relative au jour où l'on parle, elle se lit comme une date. */
    private static final Pattern RELATIVE = Pattern.compile("\\b(demain|tomorrow|yesterday|hier|next (?:week|month|quarter)|"
        + "(?:la )?semaine prochaine|(?:le )?mois prochain|end of (?:the )?(?:week|month|quarter|year)|"
        + "fin (?:de (?:la )?semaine|du mois|d'annee|de l'annee|du trimestre))\\b", FLAGS);

    private static final Pattern ISSUE_KEY = Pattern.compile("\\b[A-Z][A-Z0-9]{1,9}-\\d+\\b");
    private static final Pattern LIST_MARK = Pattern.compile("(?m)^\\s*\\d+[.)]\\s+");
    /** Un nombre : pas collé à un mot, ni à une clé (« OPS-35 »), ni la suite d'un autre ; « v4.3 » est un nombre. */
    private static final Pattern NUMBER = Pattern.compile("(?<![\\p{L}\\p{N}_.:/-])v?(\\d{1,3}(?:[ ,.]\\d{3})+(?!\\d)|\\d+(?:[.,]\\d+)?)");
    /** Ce qui, après un petit nombre, dit qu'il compte quelque chose de précis : « 3 jours » doit avoir été lu, « 2 points » non. */
    private static final Pattern MEASURED = Pattern.compile("^\\s?(?:%|ms\\b|s\\b|sec|min|h\\b|heures?\\b|hours?\\b|hrs?\\b|jours?\\b|"
        + "days?\\b|semaines?\\b|weeks?\\b|mois\\b|months?\\b|ans?\\b|years?\\b|k\\b|go\\b|gb\\b|mo\\b|mb\\b|ko\\b|kb\\b|\\u20AC|\\$|"
        + "euros?\\b|dollars?\\b|clients?\\b|customers?\\b|utilisateurs?\\b|users?\\b|personnes?\\b|people\\b|tickets?\\b|lignes?\\b|"
        + "lines?\\b|fois\\b|times\\b)", FLAGS);
    private static final Pattern CODE_SPAN = Pattern.compile("(?s)```.*?```|`[^`\\n]*`");
    private static final Pattern HEADING = Pattern.compile("(?m)^\\s*#+\\s.*$");
    private static final Pattern BOLD = Pattern.compile("\\*\\*[^*\\n]+\\*\\*");
    private static final Pattern CAPITALIZED = Pattern.compile("\\p{Lu}[\\p{L}\\p{N}]+");
    private static final Pattern TITLE_BEFORE = Pattern.compile("\\b(M|Mme|Mr|Mrs|Ms|Dr)\\.?\\s*$");

    /** Des prénoms courants : celui qui ouvre une phrase n'a que ce repère. Pas ceux qui sont aussi des mots (Will, Mark, Hope). */
    private static final Set<String> FIRST_NAMES = Set.copyOf(Arrays.asList(
        "aaron", "adam", "agathe", "ahmed", "aicha", "alain", "alexander", "alexandre", "alice", "alicia", "amanda", "amelie",
        "amine", "amy", "andrea", "andrew", "angela", "anna", "anne", "anthony", "antoine", "antonio", "arnaud", "arthur",
        "ashley", "aurelie", "barbara", "benjamin", "benoit", "bernard", "betty", "brandon", "brenda", "brian", "camille",
        "carlos", "carmen", "carol", "carolyn", "catherine", "cecile", "celine", "charles", "charlotte", "chen", "chloe",
        "christine", "christophe", "christopher", "claire", "clara", "claude", "cynthia", "damien", "daniel", "david", "deborah",
        "denis", "dennis", "diane", "diego", "dominique", "donna", "edward", "elena", "elizabeth", "elodie", "emilie", "emily",
        "emma", "eric", "ethan", "fabien", "fatima", "florence", "francois", "francoise", "gabriel", "gael", "gary", "george",
        "georges", "gerard", "gregory", "guillaume", "hans", "heather", "helen", "helene", "henry", "hugo", "ines", "isabelle",
        "ivan", "jacob", "jacques", "james", "janet", "jason", "jean", "jeffrey", "jennifer", "jerome", "jessica", "john",
        "jonathan", "jordan", "jose", "joseph", "joshua", "juan", "jules", "julie", "julien", "juliette", "justin", "karen",
        "karim", "katherine", "kathleen", "kenneth", "kevin", "kimberly", "klaus", "lars", "laura", "laurent", "lea", "leila",
        "leo", "linda", "lisa", "louis", "louise", "luca", "lucas", "lucia", "lucie", "luis", "manon", "marc", "marco",
        "margaret", "margaux", "maria", "marie", "marion", "martin", "mary", "mateo", "mathieu", "matteo", "matthew", "maxime",
        "mehdi", "melissa", "michael", "michel", "michelle", "miguel", "mohamed", "nadia", "nancy", "nathalie", "nathan",
        "nicholas", "nicolas", "nicole", "noah", "olga", "olivia", "olivier", "oscar", "pablo", "pamela", "patricia", "patrick",
        "paul", "pauline", "pedro", "peter", "philippe", "pierre", "priya", "rachel", "rahul", "raphael", "raymond", "rebecca",
        "richard", "robert", "romain", "ronald", "ryan", "samantha", "samir", "samuel", "sandra", "sandrine", "sara", "sarah",
        "scott", "sebastien", "sharon", "shirley", "simon", "sofia", "sophie", "stephane", "stephanie", "stephen", "steven",
        "susan", "sven", "sylvie", "theo", "thomas", "timothy", "tyler", "valerie", "vincent", "virginie", "william", "yann",
        "youssef", "zachary"));

    /** Ce qui prend une majuscule sans être un fait : les mots d'un tableau, des titres de parties, des sigles de métier. */
    private static final Set<String> GENERIC = Set.copyOf(Arrays.asList(
        "cortex", "taskforce", "done", "backlog", "review", "progress", "todo", "blocked", "bug", "bugs", "feature", "features",
        "task", "tasks", "high", "medium", "low", "urgent", "none", "summary", "resume", "status", "statut", "next", "steps",
        "step", "etape", "etapes", "owner", "action", "actions", "items", "blocker", "blockers", "decision", "decisions", "note",
        "notes", "update", "context", "contexte", "etat", "remaining", "reste", "tl", "dr", "tldr", "team", "equipe", "hi",
        "hello", "bonjour", "salut", "thanks", "merci", "cordialement", "regards", "monsieur", "madame", "french", "english",
        "francais", "anglais", "markdown", "important", "attention", "not", "nb", "ps", "tbd", "api", "ui", "ux", "qa", "pr",
        "ci", "cd", "sla", "kpi", "mvp", "eta", "faq", "url", "uri", "http", "https", "sql", "json", "csv", "pdf", "ok", "ai",
        "ia", "id", "utc", "eu", "us", "ue", "cto", "ceo", "rh", "hr", "it", "tva", "vat", "fr", "en", "issue", "issues",
        "client", "clients", "customer", "customers"));

    /** Les personnes, dates, nombres et noms propres de la réponse que le modèle n'a pas lus, chacun une fois. */
    static List<String> inventions(String answer, String read, Collection<String> alsoAllowed) {
        String reference = plain(read + " " + String.join(" ", alsoAllowed));
        Known known = Known.of(reference);
        Set<String> invented = new LinkedHashSet<>();
        String text = CODE_SPAN.matcher(plain(answer)).replaceAll(" ");

        // Les dates d'abord : une fois lues, leurs chiffres ne comptent plus comme des nombres.
        StringBuilder rest = new StringBuilder(text);
        for (Span date : dates(text)) {
            if (date.days().stream().noneMatch(known.days::contains)) invented.add(text.substring(date.start(), date.end()).replaceFirst("\\.$", ""));
            for (int i = date.start(); i < date.end(); i++) rest.setCharAt(i, ' ');
        }
        String body = rest.toString();

        monthsAndDays(body, known, invented);
        Matcher relative = RELATIVE.matcher(body);
        while (relative.find()) {
            if (!reference.toLowerCase(Locale.ROOT).contains(relative.group(1).toLowerCase(Locale.ROOT))) invented.add(relative.group(1));
        }
        Matcher key = ISSUE_KEY.matcher(body);
        while (key.find()) {
            if (!reference.contains(key.group())) invented.add(key.group());
        }
        numbers(body, known, invented);
        people(body, known, invented);
        names(body, known, invented);
        return List.copyOf(invented);
    }

    /** Ce que le modèle a lu, sous les formes que la réponse peut reprendre. */
    private record Known(Set<String> words, Set<String> numbers, Set<String> days, Set<Integer> months, Set<Integer> weekdays) {

        static Known of(String reference) {
            Set<String> words = new HashSet<>(Arrays.asList(reference.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")));
            Set<String> numbers = new HashSet<>();
            Matcher number = NUMBER.matcher(reference);
            while (number.find()) numbers.add(canonical(number.group(1)));
            Set<String> days = new HashSet<>();
            Set<Integer> months = new HashSet<>();
            StringBuilder rest = new StringBuilder(reference);
            for (Span date : dates(reference)) {
                days.addAll(date.days());
                date.days().forEach(day -> months.add(Integer.parseInt(day.substring(0, day.indexOf('-')))));
                // Une date lue donne aussi ses chiffres : « le 14 » reprend « 14 mars ».
                Matcher digits = Pattern.compile("\\d+").matcher(reference.substring(date.start(), date.end()));
                while (digits.find()) numbers.add(canonical(digits.group()));
                for (int i = date.start(); i < date.end(); i++) rest.setCharAt(i, ' ');
            }
            Matcher month = FRENCH_MONTH.matcher(rest);
            while (month.find()) months.add(MONTHS.get(month.group(1).toLowerCase(Locale.ROOT)));
            Matcher english = ENGLISH_MONTH.matcher(rest);
            while (english.find()) months.add(MONTHS.get(english.group(1).toLowerCase(Locale.ROOT)));
            Set<Integer> weekdays = new HashSet<>();
            Matcher weekday = WEEKDAY.matcher(reference);
            while (weekday.find()) weekdays.add(weekday(weekday.group(1)));
            return new Known(words, numbers, days, months, weekdays);
        }
    }

    /** Une date trouvée dans un texte : où elle est, et ses jours possibles (« mois-jour ») ; 11/03 se lit dans les deux sens. */
    private record Span(int start, int end, List<String> days) {
    }

    private static List<Span> dates(String text) {
        List<Span> dates = new ArrayList<>();
        Matcher iso = ISO_DATE.matcher(text);
        while (iso.find()) dates.add(new Span(iso.start(), iso.end(), List.of(day(iso.group(1), iso.group(2)))));
        Matcher slash = SLASH_DATE.matcher(text);
        while (slash.find()) {
            String a = slash.group(1);
            String b = slash.group(2);
            if (Integer.parseInt(a) > 31 || Integer.parseInt(b) > 31) continue;
            dates.add(new Span(slash.start(), slash.end(), List.of(day(b, a), day(a, b))));
        }
        Matcher dayMonth = DAY_MONTH.matcher(text);
        while (dayMonth.find()) dates.add(new Span(dayMonth.start(), dayMonth.end(), List.of(day(month(dayMonth.group(2)), dayMonth.group(1)))));
        Matcher monthDay = MONTH_DAY.matcher(text);
        while (monthDay.find()) dates.add(new Span(monthDay.start(), monthDay.end(), List.of(day(month(monthDay.group(1)), monthDay.group(2)))));
        return dates;
    }

    private static String month(String word) {
        return String.valueOf(MONTHS.get(word.toLowerCase(Locale.ROOT)));
    }

    private static String day(String month, String day) {
        return Integer.parseInt(month) + "-" + Integer.parseInt(day);
    }

    private static void monthsAndDays(String body, Known known, Set<String> invented) {
        Matcher french = FRENCH_MONTH.matcher(body);
        while (french.find()) {
            if (!known.months.contains(MONTHS.get(french.group(1).toLowerCase(Locale.ROOT)))) invented.add(french.group(1));
        }
        Matcher english = ENGLISH_MONTH.matcher(body);
        while (english.find()) {
            // « May I… » en tête de phrase n'est pas un mois.
            if ("May".equals(english.group(1)) && startsSentence(body, english.start())) continue;
            if (!known.months.contains(MONTHS.get(english.group(1).toLowerCase(Locale.ROOT)))) invented.add(english.group(1));
        }
        Matcher weekday = WEEKDAY.matcher(body);
        while (weekday.find()) {
            if (!known.weekdays.contains(weekday(weekday.group(1)))) invented.add(weekday.group(1));
        }
    }

    private static int weekday(String word) {
        String lower = word.toLowerCase(Locale.ROOT);
        int french = WEEK_FR.indexOf(lower);
        return french >= 0 ? french : WEEK_EN.indexOf(lower);
    }

    private static void numbers(String body, Known known, Set<String> invented) {
        String text = LIST_MARK.matcher(body).replaceAll(" ");
        Matcher number = NUMBER.matcher(text);
        while (number.find()) {
            String value = canonical(number.group(1));
            boolean small = value.length() == 1 && !MEASURED.matcher(text.substring(number.end())).find();
            if (!small && !known.numbers.contains(value)) invented.add(number.group().strip());
        }
    }

    /** Un nombre sans ses séparateurs de milliers ni ses zéros de tête ; « 3,5 » et « 3.5 » valent la même chose. */
    private static String canonical(String number) {
        String flat = number.matches("\\d{1,3}(?:[ ,.]\\d{3})+") ? number.replaceAll("[ ,.]", "") : number.replace(',', '.');
        return flat.replaceFirst("^0+(?=\\d)", "");
    }

    private static void people(String body, Known known, Set<String> invented) {
        Matcher word = CAPITALIZED.matcher(body);
        while (word.find()) {
            String lower = word.group().toLowerCase(Locale.ROOT);
            if (FIRST_NAMES.contains(lower) && !known.words.contains(lower)) invented.add(word.group());
        }
    }

    /**
     * Les noms propres : une majuscule au milieu d'une phrase, ou un sigle n'importe où, que le modèle n'a pas lus. Les
     * titres et le gras ne comptent pas : on y met des majuscules partout.
     */
    private static void names(String body, Known known, Set<String> invented) {
        String text = BOLD.matcher(HEADING.matcher(body).replaceAll(" ")).replaceAll(" ");
        Matcher word = CAPITALIZED.matcher(text);
        while (word.find()) {
            String found = word.group();
            String lower = found.toLowerCase(Locale.ROOT);
            if (known.words.contains(lower) || GENERIC.contains(lower) || MONTHS.containsKey(lower)
                || WEEK_EN.contains(lower) || WEEK_FR.contains(lower)) {
                continue;
            }
            boolean acronym = found.equals(found.toUpperCase(Locale.ROOT)) && found.chars().anyMatch(Character::isLetter);
            boolean titled = TITLE_BEFORE.matcher(text.substring(Math.max(0, word.start() - 5), word.start())).find();
            if (acronym || titled || !startsSentence(text, word.start())) invented.add(found);
        }
    }

    /** Le mot ouvre une phrase ou une ligne, derrière le balisage éventuel (une puce, du gras, un guillemet). */
    private static boolean startsSentence(String text, int start) {
        int at = start - 1;
        while (at >= 0 && " \t*_>#\"«“'(".indexOf(text.charAt(at)) >= 0) at--;
        if (at < 0 || text.charAt(at) == '\n' || text.charAt(at) == '\r') return true;
        char before = text.charAt(at);
        if (".!?:;…".indexOf(before) >= 0) return true;
        if ("-•–)".indexOf(before) >= 0) {
            int previous = at - 1;
            while (previous >= 0 && (text.charAt(previous) == ' ' || Character.isDigit(text.charAt(previous)))) previous--;
            return previous < 0 || text.charAt(previous) == '\n' || text.charAt(previous) == '\r';
        }
        return false;
    }

    private static Map<String, Integer> months() {
        Map<String, Integer> months = new LinkedHashMap<>();
        String[][] names = {
            {"janvier", "january", "janv", "jan"}, {"fevrier", "february", "fevr", "fev", "feb"}, {"mars", "march", "mar"},
            {"avril", "april", "avr", "apr"}, {"mai", "may"}, {"juin", "june", "jun"}, {"juillet", "july", "juil", "jul"},
            {"aout", "august", "aug"}, {"septembre", "september", "sept", "sep"}, {"octobre", "october", "oct"},
            {"novembre", "november", "nov"}, {"decembre", "december", "dec"}};
        for (int month = 0; month < names.length; month++) {
            for (String name : names[month]) months.put(name, month + 1);
        }
        return months;
    }

    // -------------------------------------------------------------------------
    // Le reste
    // -------------------------------------------------------------------------

    /** Le texte sans accents, avec des guillemets et des espaces simples : celui que les motifs lisent. */
    static String plain(String text) {
        if (text == null) return "";
        String flat = text.replace('’', '\'').replace(' ', ' ').replace(' ', ' ');
        return Normalizer.normalize(flat, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
    }

    private static String excerpt(String answer) {
        String flat = answer.replace('\n', ' ').strip();
        return flat.length() <= EXCERPT ? flat : flat.substring(0, EXCERPT) + "...";
    }
}
