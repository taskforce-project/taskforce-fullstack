package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantToolCall;

/**
 * TaskForce dit ce qui a été fait ; le modèle ne l'affirme jamais seul (R116, séance n°17 du Conseil).
 *
 * <p>Après la réponse finale d'un tour, chaque phrase qui annonce une action de TaskForce (créer, supprimer, modifier,
 * déplacer, assigner, confier, fusionner, en français ou en anglais) est confrontée aux résultats d'outils du même tour.
 * Sans résultat réussi de ce genre, la phrase est retirée, et la vérité prend sa place, signée par TaskForce : un bloc
 * {@code > [!taskforce] TaskForce} que l'app montre comme la parole de TaskForce, pas comme celle du modèle. Une
 * correction silencieuse tromperait une seconde fois (Harari, contradicteur de la séance). Le 02/11/2026, qwen3:8b
 * répondait « La carte TESTTA-2 a été supprimée du projet test-taskforce. » avec, pour seul outil du tour,
 * {@code list_issues}.</p>
 *
 * <p>Une phrase n'annonce rien quand elle propose, demande, prévoit ou nie (« je peux la supprimer », « la carte est
 * prête à être créée », « rien n'a été supprimé », une question), quand l'action est celle d'un autre (« par Marie »), ou
 * quand elle raconte un passé daté (« lundi », « hier ») : aucun outil de Cortex ne lit encore l'activité, une phrase
 * datée ne se vérifie donc pas ici. Les annonces se reconnaissent à leur verbe : « TESTTA-2 est dans Done » n'en est pas
 * une.</p>
 *
 * <p>Du code seulement, sans modèle : la même réponse et les mêmes résultats donnent la même correction. Un bloc de
 * TaskForce que le modèle écrirait lui-même perd sa marque : seul le serveur signe pour TaskForce.</p>
 */
public final class ActionClaimCheck {

    /** La marque d'un bloc de TaskForce dans une réponse, que l'app reconnaît. */
    public static final String MARKER = "[!taskforce]";
    /** La première ligne d'un bloc de TaskForce : la marque, puis la signature, lisible sans l'app. */
    static final String SIGNATURE = "> " + MARKER + " TaskForce";

    private ActionClaimCheck() {
    }

    /** Ce qu'une phrase annonce, et ce que fait un outil. {@code done} : le participe de la vérité. */
    public enum Kind {
        CREATE("created"), DELETE("deleted"), UPDATE("changed"), MOVE("moved"), ASSIGN("assigned"),
        DELEGATE("delegated"), MERGE("merged");

        private final String done;

        Kind(String done) {
            this.done = done;
        }

        public String done() {
            return done;
        }
    }

    /** Un appel d'outil du tour : son nom et son statut (success, pending, question, refused, error). */
    public record Ran(String tool, String status) {
        public static List<Ran> of(List<AssistantToolCall> calls) {
            return calls == null ? List.of() : calls.stream().map(call -> new Ran(call.name(), call.status())).toList();
        }
    }

    /** Une phrase du modèle qui annonce une action qu'aucun outil réussi du tour n'a faite, et ce qu'elle annonce. */
    public record Claim(String sentence, Set<Kind> kinds) {
    }

    /** La réponse à montrer, les phrases qu'elle ne montre plus et ce que TaskForce dit à leur place. */
    public record Checked(String answer, List<Claim> claims, List<String> truths) {
        public boolean corrected() {
            return !claims.isEmpty();
        }

        /** L'incident de confiance (E17), tel que le dossier de la réponse le garde : la phrase fausse y reste. */
        public Map<String, Object> incident(List<Ran> ran) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("incident", "trust");
            data.put("experiment", "E17");
            data.put("rule", "R116");
            data.put("said", claims.stream().map(claim -> CortexRecordService.shorten(claim.sentence())).toList());
            data.put("kinds", claims.stream().flatMap(claim -> claim.kinds().stream()).distinct()
                .map(kind -> kind.name().toLowerCase(Locale.ROOT)).toList());
            data.put("shown", String.join(" ", truths));
            data.put("tools", ran.stream().map(call -> call.tool() + ": " + call.status()).toList());
            return data;
        }
    }

    /**
     * La réponse à montrer : chaque phrase qui annonce une action sans résultat réussi de ce genre dans le tour est
     * retirée, et un bloc de TaskForce dit la vérité à la place de la première.
     */
    public static Checked check(String answer, List<Ran> calls) {
        List<Ran> ran = calls == null ? List.of() : calls;
        String text = neutralized(answer == null ? "" : answer.replace("\r\n", "\n"));
        Scan scan = scan(text, ran, false);
        if (scan.claims().isEmpty()) return new Checked(text, List.of(), List.of());
        Set<Kind> claimed = EnumSet.noneOf(Kind.class);
        scan.claims().forEach(claim -> claimed.addAll(claim.kinds()));
        List<String> truths = truths(claimed, ran);
        List<String> lines = new ArrayList<>(scan.lines());
        List<String> block = new ArrayList<>();
        block.add("");
        block.add(SIGNATURE);
        truths.forEach(truth -> block.add("> " + truth));
        block.add("");
        lines.addAll(scan.at(), block);
        return new Checked(tidy(lines), List.copyOf(scan.claims()), truths);
    }

    /**
     * Les phrases d'une réponse déjà montrée qui annoncent une action qu'aucun outil n'a faite ; les blocs de TaskForce
     * n'en sont pas, ce sont ses mots. La banque note ainsi ce que la personne a vu (R118).
     */
    public static List<Claim> unbacked(String answer, List<Ran> calls) {
        return scan(answer == null ? "" : answer.replace("\r\n", "\n"), calls == null ? List.of() : calls, true).claims();
    }

    // -------------------------------------------------------------------------
    // Les annonces, reconnues à leur verbe
    // -------------------------------------------------------------------------

    private static final int FLAGS = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS;

    /** Un participe français, accordé ou non, avec ou sans accent : « supprimé », « supprimées », « supprimee ». */
    private static String fr(String... stems) {
        return "(?:" + String.join("|", stems) + ")[ée]e?s?";
    }

    /** Les verbes d'une action de TaskForce, au participe, en anglais puis en français. */
    private static String participles(Kind kind) {
        return switch (kind) {
            case CREATE -> "created|added|filed|" + fr("cr[ée]", "ajout");
            case DELETE -> "deleted|removed|erased|" + fr("supprim", "effac", "retir");
            case UPDATE -> "changed|modified|updated|edited|renamed|closed|reopened|"
                + fr("modifi", "chang", "renomm", "ferm", "cl[ôo]tur") + "|mise?s?\\s+à\\s+jour|rouvert(?:e|s|es)?";
            case MOVE -> "moved|" + fr("d[ée]plac");
            case ASSIGN -> "assigned|reassigned|unassigned|" + fr("assign", "r[ée]assign", "d[ée]sassign", "attribu");
            case DELEGATE -> "delegated|" + fr("d[ée]l[ée]gu", "confi");
            case MERGE -> "merged|" + fr("fusionn", "merg");
        };
    }

    /** Un participe d'action, son genre dans le groupe nommé ({@code create}, {@code delete}...). */
    private static final String PP = EnumSet.allOf(Kind.class).stream()
        .map(kind -> "(?<" + group(kind) + ">" + participles(kind) + ")")
        .collect(Collectors.joining("|", "(?:", ")(?![\\p{L}\\p{N}])"));

    /** Les adverbes qu'une annonce glisse entre l'auxiliaire et le verbe : « has now been », « a bien été ». */
    private static final String ADV = "(?:\\s+(?:just|also|now|already|successfully|finally|then|properly|correctly|all|"
        + "both|bien|déjà|deja|aussi|également|egalement|enfin|correctement|maintenant|désormais|desormais|ensuite|alors|"
        + "automatiquement|définitivement|definitivement|tous|toutes))*";
    /** Un état présent n'annonce un changement qu'avec son adverbe : « is now assigned », « est bien supprimée ». */
    private static final String NOW = "(?:\\s+(?:also|all|both|aussi|tous|toutes))*\\s+(?:now|already|successfully|just|"
        + "bien|maintenant|désormais|desormais|déjà|deja|correctement|à\\s+présent)" + ADV;
    private static final String KEY = "\\p{L}[\\p{L}\\p{N}]*-\\d+";
    private static final String OBJECT = "(?:issue|card|ticket|task|project|note|comment|carte|tâche|tache|projet|"
        + "commentaire)";
    /**
     * Ce qui se crée ou se modifie dans l'espace, nommé dans la proposition : un objet, une clé, un pronom. « I have
     * created a plan » parle de la réponse elle-même, pas d'un geste de TaskForce.
     */
    private static final Pattern WORKSPACE_THING = Pattern.compile("\\b(?:" + OBJECT + "s?|board|column|label|cycle|sprint|"
        + "page|document|doc|pull\\s+request|pr|branch|repository|repo|workspace|milestone|epic|subtask|checklist|assignee|"
        + "priority|status|title|description|due\\s+date|colonne|étiquette|etiquette|branche|dépôt|depot|espace|"
        + "sous-tâche|priorité|priorite|statut|titre|échéance|echeance|responsable|it|they|them|elle|elles|il|ils)s?\\b"
        + "|\\b" + KEY + "\\b|\\b(?:je|nous)\\s+(?:l['’]|les\\s)", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
        | Pattern.UNICODE_CHARACTER_CLASS);

    /** Une forme d'annonce ; un passif peut décrire un objet (« the issues that were created ») plutôt qu'annoncer. */
    private record Form(Pattern pattern, boolean passive) {
    }

    private static final List<Form> FORMS = List.of(
        // Je ou nous l'avons fait : « I deleted », « I've created », « j'ai supprimé », « je l'ai déplacée ».
        new Form(Pattern.compile("\\b(?:i(?:\\s+have|\\s+had|['’]ve|['’]d)?|we(?:\\s+have|\\s+had|['’]ve|['’]d)?"
            + "|j['’]\\s*ai|je\\s+(?:l['’]\\s*|les\\s+|lui\\s+|leur\\s+)ai"
            + "|nous\\s+(?:l['’]\\s*|les\\s+|lui\\s+|leur\\s+)?avons)" + ADV + "\\s+" + PP, FLAGS), false),
        // Un passif accompli : « has been deleted », « it's been moved », « a été supprimée », « ont bien été créées ».
        new Form(Pattern.compile("\\b(?:(?:has|have|had|['’]s|['’]ve)" + ADV + "\\s+been|(?:a|ont|avait|avaient)" + ADV
            + "\\s+[ée]t[ée])" + ADV + "\\s+" + PP, FLAGS), true),
        // Un passif passé : « was deleted », « were created ».
        new Form(Pattern.compile("\\b(?:was|were)" + ADV + "\\s+" + PP, FLAGS), true),
        // Un état nouveau, avec son adverbe : « is now assigned », « est maintenant déplacée ».
        new Form(Pattern.compile("\\b(?:is|are|['’]s|['’]re|est|sont)" + NOW + "\\s+" + PP, FLAGS), true),
        // Le titre d'un geste, en tête de phrase ou après deux-points : « Issue created », « Carte TESTTA-2 supprimée ».
        new Form(Pattern.compile("(?:^|[:;]\\s*)[\\W_]*(?:(?:the|your|a|an|new|la|le|une|un)\\s+|l['’]\\s*)*"
            + "(?:" + OBJECT + "(?:\\s+(?:nouvelle|nouveau))?(?:\\s+" + KEY + ")?(?:\\s*[«\"“][^»\"”]{0,160}[»\"”])?|" + KEY + ")"
            + "\\s*:?\\s*(?:bien\\s+|successfully\\s+)?" + PP, FLAGS), false));

    /**
     * Un verbe coordonné à une annonce : « I created TESTTA-4 and deleted TESTTA-2 », « créée puis déplacée ». Pas après
     * une virgule seule : « created, assigned to Marie » décrit l'issue créée.
     */
    private static final Pattern COORDINATED = Pattern.compile("[^.!?;:]*?\\s(?:and|et|puis|then|ensuite)\\s+"
        + "(?:(?:then|also|aussi|ensuite|puis|alors)\\s+)?" + PP, FLAGS);

    /** Une question n'annonce rien : « Veux-tu que je la supprime ? ». */
    private static final Pattern QUESTION = Pattern.compile("\\?[\\W_]*$", FLAGS);
    /** Une négation dans la proposition de l'annonce : « rien n'a été supprimé », « no issue was created ». */
    private static final Pattern NEGATION = Pattern.compile("\\b(?:not|never|nothing|none|nobody|neither|nor|cannot)\\b"
        + "|n['’]t\\b|\\bno\\s+(?=\\p{L})|\\bne\\b|\\bn['’]|\\brien\\b|\\baucun(?:e|s|es)?\\b|\\bjamais\\b|\\bpas\\b|\\bni\\b",
        FLAGS);
    /** Une proposition, une condition, un futur : « I can delete it », « sera supprimée », « prête à être créée ». */
    private static final Pattern MODAL = Pattern.compile("\\b(?:can|could|will|would|shall|should|may|might|must|if|once|"
        + "unless|until|whether|let\\s+me|going\\s+to|about\\s+to|ready\\s+to|needs?\\s+to|ha(?:s|ve)\\s+to|wants?\\s+to|"
        + "to\\s+be|peux|peut|peuvent|pourr\\p{L}*|vais|vas|va|allons|allez|vont|veux|veut|voulez|voudr\\p{L}*|"
        + "souhait\\p{L}*|dois|doit|devons|devez|doivent|devr\\p{L}*|faut|faudr\\p{L}*|sera|serai|seras|serait|serais|"
        + "serions|seriez|seront|seraient|si|lorsque|quand|dès\\s+que|une\\s+fois|avant\\s+de|afin\\s+de|à\\s+être|"
        + "prête?s?\\s+à)\\b|['’]ll\\b|\\bs['’]ils?\\b", FLAGS);
    /** Un pronom relatif juste avant un passif : l'objet est décrit, pas l'action annoncée. */
    private static final Pattern RELATIVE = Pattern.compile("\\b(?:that|which|who|qui|que|qu['’]|dont|lequel|laquelle|"
        + "lesquels|lesquelles)\\s*$", FLAGS);
    /**
     * L'action d'un autre : « par Marie », « by the agent » ; pas « par Cortex », « par défaut », ni l'IA d'une colonne
     * comme « In review by AI », celle du projet de l'échange du 02/11/2026.
     */
    private static final Pattern AGENT = Pattern.compile("[^,;:.!?]*?\\b(?:by|par)\\s+(?!(?:cortex|taskforce|me|moi|"
        + "myself|nous|us|ourselves|ai|ia|default|défaut|defaut|mistake|erreur|accident|exemple|example)\\b)[\\p{L}@]",
        FLAGS);
    /** Un passé daté, que rien du tour ne vérifie : « on Monday », « hier », « le 28/10 », « last week ». */
    private static final Pattern ANCHOR = Pattern.compile("\\b(?:yesterday|ago|earlier|previously|last\\s+(?:week|month|"
        + "year|time|night|sprint|cycle)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|"
        + "march|april|june|july|august|september|october|november|december|hier|avant-hier|tout\\s+à\\s+l['’]heure|"
        + "précédemment|precedemment|auparavant|plus\\s+tôt|la\\s+semaine\\s+(?:dernière|derniere|passée|passee)|"
        + "le\\s+mois\\s+(?:dernier|passé|passe)|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|janvier|février|"
        + "fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\\b"
        + "|\\bil\\s+y\\s+a\\s+(?:\\d+|un|une|deux|trois|quelques|plusieurs)\\s+(?:minutes?|heures?|jours?|semaines?|mois|ans?)\\b"
        + "|\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b", FLAGS);
    /** La frontière d'une proposition : une ponctuation, un tiret, ou « mais ». */
    private static final Pattern BOUNDARY = Pattern.compile("[,;:(\\[\\u2013\\u2014]|\\s-\\s|\\b(?:but|however|mais|"
        + "cependant|pourtant|sinon|otherwise)\\b", FLAGS);
    /** Où une phrase finit, dans une ligne. */
    private static final Pattern SENTENCE_END = Pattern.compile("(?<=[.!?\\u2026])\\s+");
    /** Le début d'une ligne qui n'est pas du texte : une citation, une puce, un titre. */
    private static final Pattern LEAD = Pattern.compile("^\\s*(?:>\\s?)*(?:[-*+]\\s+|\\d+[.)]\\s+)?(?:#{1,6}\\s+)?");
    private static final Pattern SIGNED = Pattern.compile("^\\s*>\\s?\\[!taskforce]", Pattern.CASE_INSENSITIVE);

    private static String group(Kind kind) {
        return kind.name().toLowerCase(Locale.ROOT);
    }

    // -------------------------------------------------------------------------
    // La lecture d'une réponse, ligne par ligne et phrase par phrase
    // -------------------------------------------------------------------------

    /** Les lignes gardées, les annonces retirées, et l'index où le bloc de TaskForce prend la place de la première. */
    private record Scan(List<String> lines, List<Claim> claims, int at) {
    }

    private static Scan scan(String text, List<Ran> ran, boolean taskforceSpeaks) {
        List<String> out = new ArrayList<>();
        List<Claim> claims = new ArrayList<>();
        int at = -1;
        boolean fence = false;
        boolean block = false;
        for (String line : text.split("\n", -1)) {
            String trimmed = line.strip();
            if (trimmed.startsWith("```")) fence = !fence;
            if (fence || trimmed.startsWith("```")) {
                out.add(line);
                continue;
            }
            // Le bloc de TaskForce d'une réponse déjà corrigée : ses mots, jamais relus comme ceux du modèle.
            block = taskforceSpeaks && (SIGNED.matcher(line).find() || block && trimmed.startsWith(">"));
            if (block) {
                out.add(line);
                continue;
            }
            Matcher lead = LEAD.matcher(line);
            String prefix = lead.lookingAt() ? line.substring(0, lead.end()) : "";
            List<String> before = new ArrayList<>();
            List<String> after = new ArrayList<>();
            boolean removed = false;
            for (String sentence : SENTENCE_END.split(line.substring(prefix.length()))) {
                Set<Kind> kinds = unbackedKinds(sentence, ran);
                if (kinds.isEmpty()) {
                    (removed ? after : before).add(sentence);
                } else {
                    claims.add(new Claim(sentence.strip(), kinds));
                    removed = true;
                }
            }
            if (!removed) {
                out.add(line);
                continue;
            }
            String head = String.join(" ", before).strip();
            String tail = String.join(" ", after).strip();
            if (!head.isEmpty()) out.add(prefix + head);
            if (at < 0) at = out.size();
            if (!tail.isEmpty()) out.add((head.isEmpty() ? prefix : "") + tail);
        }
        return new Scan(out, claims, at);
    }

    /** Ce qu'une phrase annonce et qu'aucun outil réussi du tour n'a fait ; vide si elle n'annonce rien de faux. */
    private static Set<Kind> unbackedKinds(String sentence, List<Ran> ran) {
        Set<Kind> claimed = claimedKinds(sentence);
        claimed.removeIf(kind -> ran.stream().anyMatch(call -> "success".equals(call.status())
            && backs(kindsOf(call.tool()), kind)));
        return claimed;
    }

    /** Ce qu'une phrase annonce comme fait, par ses verbes. */
    static Set<Kind> claimedKinds(String sentence) {
        Set<Kind> kinds = EnumSet.noneOf(Kind.class);
        String s = masked(sentence).strip();
        if (s.isEmpty() || QUESTION.matcher(s).find()) return kinds;
        for (Form form : FORMS) {
            Matcher m = form.pattern().matcher(s);
            while (m.find()) {
                int verb = verbStart(m);
                int start = clauseStart(s, m.start());
                int end = clauseEnd(s, m.end());
                String clause = s.substring(start, verb);
                if (NEGATION.matcher(clause).find() || MODAL.matcher(clause).find()) continue;
                if (form.passive() && RELATIVE.matcher(s.substring(start, m.start())).find()) continue;
                if (AGENT.matcher(s.substring(m.end(), end)).lookingAt()) continue;
                if (ANCHOR.matcher(s.substring(0, end)).find()) continue;
                Kind kind = kindOf(m);
                boolean aboutTheAnswer = (kind == Kind.CREATE || kind == Kind.UPDATE)
                    && !WORKSPACE_THING.matcher(s.substring(start, end)).find();
                if (aboutTheAnswer) continue;
                kinds.add(kind);
                Matcher next = COORDINATED.matcher(s);
                next.region(m.end(), s.length());
                while (next.lookingAt()) {
                    String between = s.substring(next.regionStart(), verbStart(next));
                    if (NEGATION.matcher(between).find() || MODAL.matcher(between).find()) break;
                    kinds.add(kindOf(next));
                    next.region(next.end(), s.length());
                }
            }
        }
        return kinds;
    }

    /** Le texte que lisent les formes : sans emphase, les liens réduits à leur texte, un titre cité réduit à rien. */
    private static String masked(String sentence) {
        return sentence.replaceAll("\\[([^\\]]*)]\\([^)]*\\)", "$1")
            .replaceAll("«[^»]*»", "«Q»").replaceAll("“[^”]*”", "“Q”").replaceAll("\"[^\"]*\"", "\"Q\"")
            .replace("*", "").replace("`", "").replace("~~", "");
    }

    private static int verbStart(Matcher m) {
        for (Kind kind : Kind.values()) {
            if (m.group(group(kind)) != null) return m.start(group(kind));
        }
        return m.end();
    }

    private static Kind kindOf(Matcher m) {
        for (Kind kind : Kind.values()) {
            if (m.group(group(kind)) != null) return kind;
        }
        throw new IllegalStateException("An action verb without its kind");
    }

    private static int clauseStart(String s, int from) {
        Matcher b = BOUNDARY.matcher(s.substring(0, from));
        int start = 0;
        while (b.find()) start = b.end();
        return start;
    }

    private static int clauseEnd(String s, int from) {
        Matcher b = BOUNDARY.matcher(s);
        return b.find(from) ? b.start() : s.length();
    }

    // -------------------------------------------------------------------------
    // Ce que font les outils du tour
    // -------------------------------------------------------------------------

    private static final Map<String, Set<Kind>> VERBS = Map.ofEntries(
        Map.entry("create", EnumSet.of(Kind.CREATE)), Map.entry("add", EnumSet.of(Kind.CREATE)),
        Map.entry("new", EnumSet.of(Kind.CREATE)), Map.entry("insert", EnumSet.of(Kind.CREATE)),
        Map.entry("post", EnumSet.of(Kind.CREATE)), Map.entry("file", EnumSet.of(Kind.CREATE)),
        Map.entry("delete", EnumSet.of(Kind.DELETE)), Map.entry("remove", EnumSet.of(Kind.DELETE)),
        Map.entry("destroy", EnumSet.of(Kind.DELETE)), Map.entry("trash", EnumSet.of(Kind.DELETE)),
        Map.entry("erase", EnumSet.of(Kind.DELETE)),
        Map.entry("update", EnumSet.of(Kind.UPDATE)), Map.entry("edit", EnumSet.of(Kind.UPDATE)),
        Map.entry("modify", EnumSet.of(Kind.UPDATE)), Map.entry("change", EnumSet.of(Kind.UPDATE)),
        Map.entry("rename", EnumSet.of(Kind.UPDATE)), Map.entry("set", EnumSet.of(Kind.UPDATE)),
        Map.entry("patch", EnumSet.of(Kind.UPDATE)), Map.entry("close", EnumSet.of(Kind.UPDATE)),
        Map.entry("reopen", EnumSet.of(Kind.UPDATE)), Map.entry("mark", EnumSet.of(Kind.UPDATE)),
        Map.entry("save", EnumSet.of(Kind.CREATE, Kind.UPDATE)),
        Map.entry("move", EnumSet.of(Kind.MOVE)), Map.entry("transition", EnumSet.of(Kind.MOVE)),
        Map.entry("assign", EnumSet.of(Kind.ASSIGN)), Map.entry("unassign", EnumSet.of(Kind.ASSIGN)),
        Map.entry("reassign", EnumSet.of(Kind.ASSIGN)),
        Map.entry("delegate", EnumSet.of(Kind.DELEGATE)),
        Map.entry("merge", EnumSet.of(Kind.MERGE)), Map.entry("apply", EnumSet.of(Kind.MERGE)));

    /** Un outil qui commence par lire ne fait rien, quels que soient ses autres mots. */
    private static final Set<String> READS = Set.of("list", "get", "search", "find", "read", "fetch", "query", "show",
        "view", "count");

    /** Ce que fait un outil, d'après les verbes de son nom ({@code create_issue}, {@code linear__save_issue}...). */
    static Set<Kind> kindsOf(String tool) {
        Set<Kind> kinds = EnumSet.noneOf(Kind.class);
        if (tool == null || tool.isBlank()) return kinds;
        int sep = tool.indexOf("__");
        String bare = sep >= 0 ? tool.substring(sep + 2) : tool;
        String[] words = bare.replaceAll("(\\p{Ll})(\\p{Lu})", "$1_$2").toLowerCase(Locale.ROOT).split("[^a-z]+");
        if (words.length == 0 || READS.contains(words[0])) return kinds;
        for (String word : words) kinds.addAll(VERBS.getOrDefault(word, Set.of()));
        return kinds;
    }

    /**
     * Un outil réussi du même genre fait foi. Déplacer, assigner, confier ou fusionner, c'est aussi changer ; une
     * modification peut déplacer ou assigner ; une issue se crée avec la personne qui l'a.
     */
    private static boolean backs(Set<Kind> tool, Kind claim) {
        if (tool.contains(claim)) return true;
        return switch (claim) {
            case UPDATE -> !Collections.disjoint(tool, EnumSet.of(Kind.MOVE, Kind.ASSIGN, Kind.DELEGATE, Kind.MERGE));
            case MOVE -> tool.contains(Kind.UPDATE);
            case ASSIGN -> tool.contains(Kind.UPDATE) || tool.contains(Kind.CREATE);
            default -> false;
        };
    }

    // -------------------------------------------------------------------------
    // La vérité, depuis les résultats du tour
    // -------------------------------------------------------------------------

    /** Ce que sont devenus les outils d'un genre dans le tour, de l'état le plus avancé au plus vide. */
    private enum Situation {
        PREPARED, PENDING, QUESTION, REFUSED, FAILED, NONE
    }

    private static Situation situation(Kind kind, List<Ran> ran) {
        List<Ran> relevant = ran.stream().filter(call -> backs(kindsOf(call.tool()), kind)).toList();
        // Une issue préparée en carte (R78) : la carte porte ce que la phrase disait fait, la personne la crée.
        if (relevant.stream().anyMatch(call -> "pending".equals(call.status()) && AgentService.PREPARED.contains(call.tool()))) {
            return Situation.PREPARED;
        }
        if (relevant.stream().anyMatch(call -> "pending".equals(call.status()))) return Situation.PENDING;
        if (relevant.stream().anyMatch(call -> AgentService.QUESTION.equals(call.status()))) return Situation.QUESTION;
        if (relevant.stream().anyMatch(call -> "refused".equals(call.status()))) return Situation.REFUSED;
        if (relevant.stream().anyMatch(call -> "error".equals(call.status()))) return Situation.FAILED;
        return Situation.NONE;
    }

    /** Une ligne par état, les genres du même état ensemble : « Nothing was created or deleted in this turn. » */
    private static List<String> truths(Set<Kind> claimed, List<Ran> ran) {
        Map<Situation, List<Kind>> bySituation = new EnumMap<>(Situation.class);
        for (Kind kind : claimed) bySituation.computeIfAbsent(situation(kind, ran), s -> new ArrayList<>()).add(kind);
        List<String> truths = new ArrayList<>();
        bySituation.forEach((situation, kinds) -> {
            String done = done(kinds);
            truths.add(switch (situation) {
                case PREPARED -> "Nothing is created yet: check the issue below, then create it.";
                case PENDING -> "Nothing is " + done + " yet: the action below waits for your approval.";
                case QUESTION -> "Nothing is " + done + " yet: Cortex needs an answer from you first.";
                case REFUSED -> "Nothing was " + done + ": the rules of this workspace refuse this action.";
                case FAILED -> "Nothing was " + done + ": the action failed.";
                case NONE -> "Nothing was " + done + " in this turn.";
            });
        });
        return truths;
    }

    /** « created », « created or deleted », « created, moved or deleted ». */
    private static String done(List<Kind> kinds) {
        List<String> words = kinds.stream().map(Kind::done).toList();
        if (words.size() == 1) return words.get(0);
        return String.join(", ", words.subList(0, words.size() - 1)) + " or " + words.get(words.size() - 1);
    }

    // -------------------------------------------------------------------------
    // Le texte rendu
    // -------------------------------------------------------------------------

    /** Un bloc de TaskForce écrit par le modèle perd sa marque : il redevient une citation du modèle, relue comme telle. */
    private static String neutralized(String text) {
        return FORGED.matcher(text).replaceAll("");
    }

    private static final Pattern FORGED = Pattern.compile("\\[!taskforce]\\s?", Pattern.CASE_INSENSITIVE);

    /** Les lignes jointes, sans ligne vide en tête, en fin, ni deux de suite. */
    private static String tidy(List<String> lines) {
        List<String> kept = new ArrayList<>();
        for (String line : lines) {
            boolean blank = line.isBlank();
            if (blank && (kept.isEmpty() || kept.get(kept.size() - 1).isBlank())) continue;
            kept.add(blank ? "" : line);
        }
        while (!kept.isEmpty() && kept.get(kept.size() - 1).isBlank()) kept.remove(kept.size() - 1);
        return String.join("\n", kept);
    }
}
