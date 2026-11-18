package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
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
 * <p>Ce qui a été fait dans la conversation compte aussi (R204, séance n°28) : le 17/11/2026, Cortex créait un projet
 * dans TaskForce sur la carte de sa question, puis répondait au tour suivant qu'il n'en avait pas créé. Une phrase qui
 * nie une action faite dans la conversation, ou dans le tour, est retirée de la même façon, et un bloc signé
 * {@code TaskForce · done} dit ce qui a été fait, et où ; une phrase qui dit fait ce qu'un tour d'avant a fait dit vrai.
 * Une négation qui porte sur une autre chose, un autre système (« pas dans Linear », pour un projet créé dans TaskForce),
 * une condition, ou la carte du tour qui attend la personne ne nie rien de fait.</p>
 *
 * <p>Prudence (second tour de la relecture R159 de la PR #548) : une phrase sur un geste d'avant n'est remplacée qu'en cas
 * de contradiction nette avec un geste qu'elle désigne : par sa clé, un titre cité, un nom propre, ou parce qu'elle est
 * la réponse qui suit le geste du même genre, sans rien d'autre qui désigne. Une phrase incertaine (« le projet pour la
 * démo », un geste plus ancien) reste telle quelle, et un bloc signé {@code TaskForce · record} dit à côté ce que la
 * conversation a fait. Une phrase sur ce que la demande en cours demande parle d'elle, pas des gestes d'avant.</p>
 *
 * <p>Du code seulement, sans modèle : la même réponse et les mêmes résultats donnent la même correction. Un bloc de
 * TaskForce que le modèle écrirait lui-même perd sa marque : seul le serveur signe pour TaskForce. La ligne qui ouvre ce
 * que TaskForce ajoute aux réponses d'avant ({@link ThreadActs#HEADER}) disparaît aussi de ce qu'il écrit.</p>
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

    /**
     * Un appel d'outil du tour : son nom, son statut (success, pending, question, refused, error) et, quand il est connu,
     * ce qu'il a rendu.
     */
    public record Ran(String tool, String status, String output) {
        public Ran(String tool, String status) {
            this(tool, status, null);
        }

        public static List<Ran> of(List<AssistantToolCall> calls) {
            return calls == null ? List.of() : calls.stream().map(call -> new Ran(call.name(), call.status(), call.output()))
                .toList();
        }
    }

    /**
     * Un geste fait dans la conversation, et qui reste fait (R204) : l'outil, le système où il a écrit (« TaskForce »,
     * « Linear »), ce qu'il a rendu, ses arguments, et s'il vient de la réponse précédente ou de ce tour ({@code recent}).
     * Une phrase de Cortex ne le nie pas. Un geste plus ancien ne compte que pour la phrase qui le désigne, par sa clé, son
     * nom ou son titre (relecture R159 de la PR #548).
     */
    public record Done(String tool, String where, String output, String arguments, boolean recent) {
        /** Un geste de la réponse précédente, ou de ce tour. */
        public Done(String tool, String where, String output) {
            this(tool, where, output, null, true);
        }
    }

    /** Une phrase du modèle qui annonce une action qu'aucun outil réussi du tour n'a faite, et ce qu'elle annonce. */
    public record Claim(String sentence, Set<Kind> kinds) {
    }

    /**
     * La réponse à montrer, les phrases qu'elle ne montre plus et ce que TaskForce dit à leur place : {@code claims}, des
     * actions annoncées sans leur résultat (R116) ; {@code denials}, des actions de la conversation niées (R204) ;
     * {@code recorded}, le bloc dit à côté d'une phrase incertaine qui reste (relecture R159) : ce que ce tour a fait de ce
     * qu'elle annonce, puis ce que la conversation a fait ; {@code unsure}, ces phrases incertaines.
     */
    public record Checked(String answer, List<Claim> claims, List<String> truths, List<Claim> denials,
                          List<String> doneTruths, List<String> recorded, List<Claim> unsure) {
        public Checked {
            recorded = recorded == null ? List.of() : List.copyOf(recorded);
            unsure = unsure == null ? List.of() : List.copyOf(unsure);
        }

        public Checked(String answer, List<Claim> claims, List<String> truths) {
            this(answer, claims, truths, List.of(), List.of(), List.of(), List.of());
        }

        public Checked(String answer, List<Claim> claims, List<String> truths, List<Claim> denials, List<String> doneTruths) {
            this(answer, claims, truths, denials, doneTruths, List.of(), List.of());
        }

        public boolean corrected() {
            return !claims.isEmpty() || !denials.isEmpty();
        }

        /** Une phrase niait une action faite dans la conversation (R204). */
        public boolean denied() {
            return !denials.isEmpty();
        }

        /**
         * Une phrase parlait d'un geste d'avant sans le désigner : elle reste, avec le bloc record à côté (troisième tour
         * de la relecture R159 de la PR #548) ; le dossier en garde la trace.
         */
        public boolean uncertain() {
            return !unsure.isEmpty();
        }

        /**
         * L'incident de confiance (E17), tel que le dossier de la réponse le garde : la phrase fausse y reste. Une réponse
         * qui n'a qu'une phrase incertaine le garde aussi, marqué {@code uncertain} (troisième tour de la relecture R159) :
         * ce que le modèle a dit, ce que TaskForce a montré à côté ; la banque le compte.
         */
        public Map<String, Object> incident(List<Ran> ran) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("incident", "trust");
            data.put("experiment", "E17");
            if (!corrected()) {
                boolean claimed = unsure.stream().anyMatch(claim -> !claimedKinds(claim.sentence()).isEmpty());
                boolean denying = unsure.stream().anyMatch(claim -> !deniedKinds(claim.sentence()).isEmpty());
                data.put("uncertain", true);
                data.put("rule", claimed && denying ? "R116, R204" : claimed ? "R116" : "R204");
                data.put("said", unsure.stream().map(claim -> CortexRecordService.shorten(claim.sentence())).toList());
                data.put("kinds", unsure.stream().flatMap(claim -> claim.kinds().stream()).distinct()
                    .map(kind -> kind.name().toLowerCase(Locale.ROOT)).toList());
                data.put("shown", String.join(" ", recorded));
                data.put("tools", ran.stream().map(call -> call.tool() + ": " + call.status()).toList());
                return data;
            }
            data.put("rule", claims.isEmpty() ? "R204" : denials.isEmpty() ? "R116" : "R116, R204");
            List<Claim> all = new ArrayList<>(claims);
            all.addAll(denials);
            data.put("said", all.stream().map(claim -> CortexRecordService.shorten(claim.sentence())).toList());
            data.put("kinds", all.stream().flatMap(claim -> claim.kinds().stream()).distinct()
                .map(kind -> kind.name().toLowerCase(Locale.ROOT)).toList());
            if (!denials.isEmpty()) {
                data.put("denied", denials.stream().map(claim -> CortexRecordService.shorten(claim.sentence())).toList());
            }
            List<String> shown = new ArrayList<>(truths);
            shown.addAll(doneTruths);
            data.put("shown", String.join(" ", shown));
            if (!unsure.isEmpty()) {
                data.put("unsure", unsure.stream().map(claim -> CortexRecordService.shorten(claim.sentence())).toList());
            }
            data.put("tools", ran.stream().map(call -> call.tool() + ": " + call.status()).toList());
            return data;
        }
    }

    /**
     * Ce qui reste incertain dans une réponse (relecture R159 de la PR #548) : les gestes d'avant dont une phrase parle
     * sans les désigner, et ces phrases, annonces et négations, avec ce qu'elles disent.
     */
    private static final class Unsure {
        private final Set<Done> acts = new LinkedHashSet<>();
        private final Map<String, Set<Kind>> claims = new LinkedHashMap<>();
        private final Map<String, Set<Kind>> denials = new LinkedHashMap<>();

        /** Une annonce incertaine : ce que ce tour en a fait se dira, puis ces gestes. */
        void claim(Said said, List<Done> same) {
            acts.addAll(same);
            claims.computeIfAbsent(said.sentence().strip(), sentence -> EnumSet.noneOf(Kind.class)).add(said.kind());
        }

        /** Une négation incertaine : ces gestes se diront. */
        void denial(Said said, List<Done> same) {
            acts.addAll(same);
            denials.computeIfAbsent(said.sentence().strip(), sentence -> EnumSet.noneOf(Kind.class)).add(said.kind());
        }
    }

    /**
     * La réponse à montrer : chaque phrase qui annonce une action sans résultat réussi de ce genre dans le tour est
     * retirée, et un bloc de TaskForce dit la vérité à la place de la première.
     */
    public static Checked check(String answer, List<Ran> calls) {
        return check(answer, calls, List.of(), Set.of());
    }

    /**
     * La même vérification, avec ce que la conversation a fait (R204) : {@code thread}, les gestes des tours d'avant qui
     * restent faits, accords et réponses donnés sur leurs cartes compris. Une phrase qui dit fait ce que la conversation a
     * fait dit vrai ; une phrase qui le nie, ou nie ce que ce tour a fait, est retirée, et un bloc de TaskForce dit ce qui a
     * été fait, et où, à la place de la première. {@code systems} : les systèmes qu'une phrase peut nommer (« TaskForce »,
     * « Linear ») ; une phrase qui nie une action dans un autre système que celui où elle a été faite dit vrai.
     */
    public static Checked check(String answer, List<Ran> calls, List<Done> thread, Set<String> systems) {
        return check(answer, calls, thread, systems, null);
    }

    /**
     * La même vérification, avec la demande en cours ({@code request}, relecture R159 de la PR #548) : une phrase sur ce
     * qu'elle demande (« je n'ai pas encore créé l'issue », à « crée une issue ») parle d'elle, pas des gestes d'avant ; une
     * annonce de ce qu'elle demande n'est appuyée que par ce tour. Une phrase incertaine sur un geste d'avant n'est jamais
     * réécrite : elle reste, et un bloc signé {@code TaskForce · record} dit à côté ce que la conversation a fait.
     */
    public static Checked check(String answer, List<Ran> calls, List<Done> thread, Set<String> systems, String request) {
        List<Ran> ran = calls == null ? List.of() : calls;
        List<Done> before = thread == null ? List.of() : thread;
        String text = neutralized(answer == null ? "" : answer.replace("\r\n", "\n"));
        Set<String> names = names(systems, before);
        Requested requested = requested(request);
        Unsure unsure = new Unsure();
        Scan scan = scan(text, sentence -> unbackedKinds(sentence, ran, before, names, requested, unsure), false);
        List<String> truths = List.of();
        if (!scan.claims().isEmpty()) {
            Set<Kind> claimed = EnumSet.noneOf(Kind.class);
            scan.claims().forEach(claim -> claimed.addAll(claim.kinds()));
            truths = truths(claimed, ran);
            text = withBlock(scan, SIGNATURE, truths);
        }
        List<Done> done = doneIn(before, ran);
        List<Done> now = doneIn(List.of(), ran);
        Set<String> all = names(names, done);
        Map<String, Set<Done>> denied = new LinkedHashMap<>();
        Scan denials = done.isEmpty() ? null : scan(text, sentence -> {
            Set<Done> contradicted = contradicted(sentence, done, now, ran, all, requested, unsure);
            if (contradicted.isEmpty()) return EnumSet.noneOf(Kind.class);
            denied.put(sentence.strip(), contradicted);
            return deniedKinds(sentence);
        }, true);
        boolean contradicted = denials != null && !denials.claims().isEmpty();
        List<Done> said = denied.values().stream().flatMap(Set::stream).distinct().limit(MAX_DONE_SAID).toList();
        List<String> doneTruths = said.stream().map(ActionClaimCheck::doneTruth).toList();
        String shown = contradicted ? withBlock(denials, DONE_SIGNATURE, doneTruths) : text;
        // Ce qui reste incertain : la phrase reste (relecture R159). À côté, ce que ce tour a fait de ce qu'elle annonce,
        // la vérité de R116 (troisième tour), puis ce que la conversation a fait.
        Set<String> removed = new LinkedHashSet<>();
        scan.claims().forEach(claim -> removed.add(claim.sentence()));
        if (contradicted) denials.claims().forEach(claim -> removed.add(claim.sentence()));
        List<Claim> uncertain = new ArrayList<>();
        Set<Kind> announced = EnumSet.noneOf(Kind.class);
        unsure.claims.forEach((sentence, kinds) -> {
            if (removed.contains(sentence)) return;
            uncertain.add(new Claim(sentence, kinds));
            announced.addAll(kinds);
        });
        unsure.denials.forEach((sentence, kinds) -> {
            if (!removed.contains(sentence)) uncertain.add(new Claim(sentence, kinds));
        });
        List<String> recorded = new ArrayList<>();
        List<String> told = truths;
        if (!announced.isEmpty()) truths(announced, ran).stream().filter(truth -> !told.contains(truth)).forEach(recorded::add);
        unsure.acts.stream().filter(act -> !said.contains(act)).limit(MAX_DONE_SAID).map(ActionClaimCheck::doneTruth)
            .distinct().forEach(recorded::add);
        if (uncertain.isEmpty()) recorded.clear();
        if (!recorded.isEmpty()) shown = withRecord(shown, recorded);
        return new Checked(shown, List.copyOf(scan.claims()), truths,
            contradicted ? List.copyOf(denials.claims()) : List.of(), contradicted ? doneTruths : List.of(), recorded,
            uncertain);
    }

    /**
     * Les phrases d'une réponse déjà montrée qui annoncent une action qu'aucun outil n'a faite ; les blocs de TaskForce
     * n'en sont pas, ce sont ses mots. La banque note ainsi ce que la personne a vu (R118).
     */
    public static List<Claim> unbacked(String answer, List<Ran> calls) {
        return unbacked(answer, calls, List.of(), Set.of());
    }

    /** Les mêmes, quand la conversation avait déjà fait des gestes (R204) : dire fait ce qu'elle a fait dit vrai. */
    public static List<Claim> unbacked(String answer, List<Ran> calls, List<Done> thread, Set<String> systems) {
        return unbacked(answer, calls, thread, systems, null);
    }

    /** Les mêmes, avec la demande en cours : une annonce de ce qu'elle demande n'est appuyée que par ce tour. */
    public static List<Claim> unbacked(String answer, List<Ran> calls, List<Done> thread, Set<String> systems,
                                       String request) {
        List<Ran> ran = calls == null ? List.of() : calls;
        List<Done> before = thread == null ? List.of() : thread;
        Set<String> names = names(systems, before);
        Requested requested = requested(request);
        return scan(answer == null ? "" : answer.replace("\r\n", "\n"),
            sentence -> unbackedKinds(sentence, ran, before, names, requested, new Unsure()), true).claims();
    }

    /**
     * Les phrases d'une réponse déjà montrée qui nient une action faite dans la conversation ou dans le tour (R204) ; les
     * blocs de TaskForce n'en sont pas. La banque note ainsi ce que la personne a vu.
     */
    public static List<Claim> denied(String answer, List<Ran> calls, List<Done> thread, Set<String> systems) {
        return denied(answer, calls, thread, systems, null);
    }

    /** Les mêmes, avec la demande en cours : une négation de ce qu'elle demande ne nie rien des tours d'avant. */
    public static List<Claim> denied(String answer, List<Ran> calls, List<Done> thread, Set<String> systems,
                                     String request) {
        List<Ran> ran = calls == null ? List.of() : calls;
        List<Done> done = doneIn(thread, ran);
        if (done.isEmpty()) return List.of();
        List<Done> now = doneIn(List.of(), ran);
        Set<String> names = names(systems, done);
        Requested requested = requested(request);
        return scan(answer == null ? "" : answer.replace("\r\n", "\n"),
            sentence -> contradicted(sentence, done, now, ran, names, requested, new Unsure()).isEmpty()
                ? EnumSet.noneOf(Kind.class) : deniedKinds(sentence), true).claims();
    }

    /** Le texte sans les blocs signés par TaskForce : les mots du modèle seuls (relecture R159). */
    public static String withoutTaskForce(String text) {
        if (text == null || text.isEmpty()) return "";
        List<String> kept = new ArrayList<>();
        boolean block = false;
        for (String line : text.replace("\r\n", "\n").split("\n", -1)) {
            block = SIGNED.matcher(line).find() || block && line.strip().startsWith(">");
            if (!block) kept.add(line);
        }
        return tidy(kept);
    }

    /** La première ligne du bloc qui dit, à côté d'une phrase incertaine, ce que la conversation a fait (relecture R159). */
    static final String RECORD_SIGNATURE = SIGNATURE + " · record";

    /** Le texte tel quel, puis le bloc de ce que la conversation a fait : la phrase incertaine n'est pas réécrite. */
    private static String withRecord(String text, List<String> recorded) {
        List<String> lines = new ArrayList<>(List.of(text.split("\n", -1)));
        lines.add("");
        lines.add(RECORD_SIGNATURE);
        recorded.forEach(truth -> lines.add("> " + truth));
        return tidy(lines);
    }

    /** Le texte d'un passage, son bloc de TaskForce à la place de la première phrase retirée. */
    private static String withBlock(Scan scan, String signature, List<String> truths) {
        List<String> lines = new ArrayList<>(scan.lines());
        List<String> block = new ArrayList<>();
        block.add("");
        block.add(signature);
        truths.forEach(truth -> block.add("> " + truth));
        block.add("");
        lines.addAll(scan.at(), block);
        return tidy(lines);
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
            case UPDATE -> "changed|modified|updated|edited|renamed|closed|reopened|marked|"
                + fr("modifi", "chang", "renomm", "ferm", "cl[ôo]tur", "marqu") + "|mise?s?\\s+à\\s+jour|rouvert(?:e|s|es)?";
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

    private static Scan scan(String text, Function<String, Set<Kind>> wrong, boolean taskforceSpeaks) {
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
                Set<Kind> kinds = wrong.apply(sentence);
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

    /**
     * Ce qu'une phrase annonce et qu'aucun outil réussi du tour n'a fait, ni aucun geste d'avant de la conversation qui
     * reste fait (R204) ; vide si elle n'annonce rien de faux. Un geste d'avant n'appuie une annonce que s'il est du même
     * genre, sur la même chose et dans le même système quand la proposition les nomme. R116 ne la corrige qu'en cas de
     * contradiction nette (second tour de la relecture R159) : elle nomme une autre chose (« J'ai créé le projet
     * Marketing. », après TESTTASKFO), ou elle annonce ce que la demande en cours demande, et rien de ce tour ne l'a fait.
     * Sans rien d'autre qui désigne la chose (« le projet », « ton projet », « pour vous »), un geste de la réponse
     * précédente l'appuie. Incertaine (« le projet pour la démo », un geste plus ancien), elle reste, et ces gestes vont dans
     * {@code unsure} : TaskForce les dit à côté.
     */
    private static Set<Kind> unbackedKinds(String sentence, List<Ran> ran, List<Done> thread, Set<String> systems,
                                           Requested requested, Unsure unsure) {
        Set<Kind> unbacked = EnumSet.noneOf(Kind.class);
        for (Said said : claims(sentence)) {
            boolean now = ran.stream().anyMatch(call -> "success".equals(call.status()) && backs(kindsOf(call.tool()), said.kind()));
            if (now) continue;
            List<Done> same = sameKind(said, thread, systems);
            if (same.isEmpty()) {
                unbacked.add(said.kind());
                continue;
            }
            Designation designation = designation(said, systems);
            if (designation.strong()) {
                // Une clé, un titre, un nom : le geste qu'elle désigne l'appuie ; une autre chose nommée, non (R116).
                if (same.stream().noneMatch(act -> designates(designation, act))) unbacked.add(said.kind());
                continue;
            }
            if (requested.asks(said)) {
                // Ce que la demande en cours demande, et rien de ce tour ne l'a fait (R116) ; « déjà » renvoie peut-être à un
                // geste d'avant, que rien ne désigne : la phrase reste, avec à côté ce que la conversation a fait (troisième
                // tour de la relecture R159). De même quand la demande ne nomme aucune chose, juste après un geste du même
                // genre (« Tu le crées ou pas ? », cinquième tour) : « le » est peut-être ce geste.
                if (ALREADY.matcher(said.clause()).find() || pronounAfterAnAct(requested, same)) unsure.claim(said, same);
                else unbacked.add(said.kind());
                continue;
            }
            if (designation.weak()) {
                // Ce dont parle la chose : les mots d'un geste l'appuient ; sinon, incertaine.
                if (same.stream().noneMatch(act -> mentions(designation, act))) unsure.claim(said, same);
                continue;
            }
            if (same.stream().noneMatch(Done::recent)) unsure.claim(said, same);
        }
        return unbacked;
    }

    /**
     * Une demande qui ne nomme aucune chose (un pronom : « Tu le crées ou pas ? », « Tu peux la créer ? »), juste après un
     * geste du même genre : elle parle peut-être de ce geste (cinquième tour de la relecture R159 de la PR #548).
     */
    private static boolean pronounAfterAnAct(Requested requested, List<Done> same) {
        return requested.things().isEmpty() && same.stream().anyMatch(Done::recent);
    }

    /** Ce qui renvoie à un geste d'avant, pas à la demande en cours : « le projet a déjà été créé ». */
    private static final Pattern ALREADY = Pattern.compile("\\b(?:already|d[ée]j[àa])\\b", FLAGS);

    /**
     * Une action qu'une phrase dit faite, ou nie : son genre, la proposition qui la dit, où se lisent sa chose et son
     * système, et la phrase entière, où se lisent les titres qu'elle cite.
     */
    private record Said(Kind kind, String clause, String sentence) {
    }

    /** Ce qu'une phrase annonce comme fait, par ses verbes. */
    static Set<Kind> claimedKinds(String sentence) {
        Set<Kind> kinds = EnumSet.noneOf(Kind.class);
        claims(sentence).forEach(said -> kinds.add(said.kind()));
        return kinds;
    }

    /** Ce qu'une phrase annonce comme fait, proposition par proposition. */
    private static List<Said> claims(String sentence) {
        List<Said> claims = new ArrayList<>();
        String s = masked(sentence).strip();
        if (s.isEmpty() || QUESTION.matcher(s).find()) return claims;
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
                claims.add(new Said(kind, s.substring(start, end), sentence));
                Matcher next = COORDINATED.matcher(s);
                next.region(m.end(), s.length());
                while (next.lookingAt()) {
                    String between = s.substring(next.regionStart(), verbStart(next));
                    if (NEGATION.matcher(between).find() || MODAL.matcher(between).find()) break;
                    claims.add(new Said(kindOf(next), s.substring(start, clauseEnd(s, next.end())), sentence));
                    next.region(next.end(), s.length());
                }
            }
        }
        return claims;
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
    // Ce qu'une phrase nie (R204) : « je n'ai pas créé de projet », alors qu'il l'a été
    // -------------------------------------------------------------------------

    /** La première ligne du bloc qui dit ce qui a été fait, à la place d'une phrase qui le niait. */
    static final String DONE_SIGNATURE = SIGNATURE + " · done";
    /** Ce que le bloc dit au plus : les gestes que les phrases niaient, les premiers. */
    private static final int MAX_DONE_SAID = 3;

    /** Un infinitif d'action, en anglais puis en français, son genre dans le groupe nommé ({@code icreate}...). */
    private static String infinitives(Kind kind) {
        return switch (kind) {
            case CREATE -> "create|add|file|cr[ée]er|ajouter";
            case DELETE -> "delete|remove|erase|supprimer|effacer|retirer";
            case UPDATE -> "change|modify|update|edit|rename|modifier|changer|renommer|mettre\\s+à\\s+jour";
            case MOVE -> "move|d[ée]placer";
            case ASSIGN -> "assign|reassign|assigner|attribuer";
            case DELEGATE -> "delegate|hand\\s+over|d[ée]l[ée]guer|confier";
            case MERGE -> "merge|fusionner";
        };
    }

    private static final String INF = EnumSet.allOf(Kind.class).stream()
        .map(kind -> "(?<i" + group(kind) + ">" + infinitives(kind) + ")")
        .collect(Collectors.joining("|", "(?:", ")(?![\\p{L}\\p{N}])"));

    /** Ce qui se glisse dans une négation : « not yet », « pas encore », « jamais vraiment ». */
    private static final String SOFT = "(?:\\s+(?:yet|actually|really|even|in\\s+fact|encore|vraiment|du\\s+tout))*";
    private static final String NOT_EN = "(?:did\\s+not|didn['’]t|have\\s+not|haven['’]t|has\\s+not|hasn['’]t|had\\s+not|"
        + "hadn['’]t|could\\s+not|couldn['’]t|was\\s+not\\s+able\\s+to|wasn['’]t\\s+able\\s+to|were\\s+not\\s+able\\s+to|"
        + "weren['’]t\\s+able\\s+to|was\\s+unable\\s+to|were\\s+unable\\s+to|never)";

    /**
     * Les formes d'une négation d'action : « I didn't create », « was not created », « no project was created », « je n'ai
     * pas (encore, pu) créé(r) », « je ne l'ai pas créé », « je n'ai créé aucun projet », « n'a pas été créé ».
     */
    private static final List<Pattern> DENIALS = List.of(
        Pattern.compile("\\b(?:i|we)\\s+" + NOT_EN + SOFT + "\\s+(?:" + INF + "|" + PP + ")", FLAGS),
        Pattern.compile("\\b(?:was|were|is|are|has|have|had)\\s+(?:not|never)" + SOFT + "(?:\\s+been)?" + SOFT + "\\s+" + PP,
            FLAGS),
        Pattern.compile("\\b(?:wasn['’]t|weren['’]t|isn['’]t|aren['’]t|hasn['’]t|haven['’]t|hadn['’]t)" + SOFT + "(?:\\s+been)?"
            + SOFT + "\\s+" + PP, FLAGS),
        Pattern.compile("\\b(?:no|nothing|none)\\b[^.!?;:]{0,40}?\\b(?:was|were|has\\s+been|have\\s+been|got)" + SOFT + "\\s+"
            + PP, FLAGS),
        Pattern.compile("\\b(?:je|j['’]|nous)\\s*(?:ne\\s+|n['’]\\s*)(?:l['’]\\s*|les\\s+|lui\\s+|leur\\s+|en\\s+|y\\s+)?"
            + "(?:ai|avons)\\s+(?:pas|jamais|rien|point)(?:\\s+(?:encore|vraiment|du\\s+tout|pu))*\\s+(?:" + INF + "|" + PP + ")",
            FLAGS),
        Pattern.compile("\\b(?:je|j['’]|nous)\\s*(?:ne\\s+|n['’]\\s*)(?:ai|avons)(?:\\s+encore)?\\s+" + PP
            + "\\s+(?:aucun|aucune|rien)\\b", FLAGS),
        Pattern.compile("\\bn['’]\\s*(?:a|ont|avait|avaient)\\s+(?:(?:toujours\\s+)?pas\\s+|jamais\\s+)?(?:encore\\s+)?[ée]t[ée]"
            + "(?:\\s+encore)?\\s+" + PP, FLAGS));

    /** Une condition n'affirme rien : « si je ne l'ai pas créé », « if it wasn't created ». */
    private static final Pattern CONDITION = Pattern.compile("\\b(?:if|unless|whether|si|à\\s+moins)\\b", FLAGS);
    /**
     * Une autre chose que celle qui a été faite : « je n'ai pas créé d'autre projet », « no duplicate » (relecture R159 de
     * la PR #548).
     */
    private static final Pattern ANOTHER = Pattern.compile("\\b(?:another|other|others|autre|autres|second|deuxième|deuxieme|"
        + "duplicates?|doublons?)\\b", FLAGS);
    /**
     * Une chose nouvelle : une autre chose seulement sans geste récent de ce genre, ou quand la demande en cours en demande
     * une (second tour de la relecture R159 : la demande de s17 disait « un nouveau projet », sa négation aussi).
     */
    private static final Pattern NEW = Pattern.compile("\\b(?:new|nouveau|nouvelle|nouveaux|nouvelles|nouvel)\\b", FLAGS);
    private static final Pattern KEY_IN = Pattern.compile("\\b" + KEY + "\\b", FLAGS);

    /** Ce sur quoi porte un geste ou une phrase : une issue (une tâche, une carte), un projet, un commentaire, une note. */
    enum Thing { ISSUE, PROJECT, COMMENT, NOTE }

    private static final Map<Thing, Pattern> THINGS = Map.of(
        Thing.ISSUE, Pattern.compile("\\b(?:issues?|cards?|tickets?|tasks?|bugs?|cartes?|t[âa]ches?)\\b", FLAGS),
        Thing.PROJECT, Pattern.compile("\\b(?:projects?|projets?)\\b", FLAGS),
        Thing.COMMENT, Pattern.compile("\\b(?:comments?|commentaires?)\\b", FLAGS),
        Thing.NOTE, Pattern.compile("\\b(?:notes?)\\b", FLAGS));

    /** Ce que nie une phrase, par ses verbes ; vide quand elle ne nie aucune action. */
    static Set<Kind> deniedKinds(String sentence) {
        Set<Kind> kinds = EnumSet.noneOf(Kind.class);
        denials(sentence).forEach(said -> kinds.add(said.kind()));
        return kinds;
    }

    /** Ce que nie une phrase, proposition par proposition : « je ne l'ai pas créé dans Linear » est une proposition. */
    private static List<Said> denials(String sentence) {
        List<Said> denials = new ArrayList<>();
        String s = masked(sentence).strip();
        if (s.isEmpty() || QUESTION.matcher(s).find()) return denials;
        for (Pattern denial : DENIALS) {
            Matcher m = denial.matcher(s);
            while (m.find()) {
                int start = clauseStart(s, m.start());
                int end = clauseEnd(s, m.end());
                if (CONDITION.matcher(s.substring(start, m.start())).find()) continue;
                if (ANCHOR.matcher(s.substring(0, end)).find()) continue;
                denials.add(new Said(deniedKind(m), s.substring(start, end), sentence));
            }
        }
        return denials;
    }

    /** Le genre du verbe nié : son participe, ou son infinitif dans les formes qui en ont un (« didn't create »). */
    private static Kind deniedKind(Matcher m) {
        Map<String, Integer> groups = m.namedGroups();
        for (Kind kind : Kind.values()) {
            if (m.group(group(kind)) != null) return kind;
            String infinitive = "i" + group(kind);
            if (groups.containsKey(infinitive) && m.group(infinitive) != null) return kind;
        }
        throw new IllegalStateException("A denied verb without its kind");
    }

    /**
     * Les gestes que nie cette phrase, nettement (second tour de la relecture R159) : du même genre (« créé » pour une
     * création), sur la même chose quand elle en nomme une (un projet, une issue), dans le même système quand elle en nomme
     * un (« dans Linear » ne nie pas ce qui a été fait dans TaskForce), et désigné : par sa clé, un titre cité, un nom propre,
     * ou parce que la phrase est la réponse qui suit ce geste, sans rien d'autre qui désigne. Une autre chose (une autre
     * clé, « un autre projet », « un nouveau » quand aucun geste de ce genre n'est récent), la carte du tour qui attend la
     * personne, ou ce que la demande en cours demande (« je n'ai pas encore créé l'issue », à « crée une issue ») : la phrase
     * dit vrai, seul ce tour peut la contredire. Incertaine (« pour la démo », un geste plus ancien), elle reste, et ces
     * gestes vont dans {@code unsure} : TaskForce les dit à côté.
     */
    private static Set<Done> contradicted(String sentence, List<Done> done, List<Done> now, List<Ran> ran,
                                          Set<String> systems, Requested requested, Unsure unsure) {
        Set<Done> contradicted = new LinkedHashSet<>();
        for (Said said : denials(sentence)) {
            if (ANOTHER.matcher(said.clause()).find()) continue;
            Set<Thing> things = thingsIn(said.clause());
            boolean waiting = ran.stream().anyMatch(call -> ("pending".equals(call.status())
                || AgentService.QUESTION.equals(call.status())) && backs(kindsOf(call.tool()), said.kind())
                && (things.isEmpty() || things.contains(thingOf(call.tool()))));
            if (waiting) continue;
            List<Done> same = sameKind(said, done, systems);
            if (same.isEmpty()) continue;
            Designation designation = designation(said, systems);
            if (designation.strong()) {
                same.stream().filter(act -> designates(designation, act)).forEach(contradicted::add);
                continue;
            }
            if (requested.asks(said)) {
                // La demande en cours demande ce geste : la phrase parle d'elle ; seul ce tour la contredit (reste du 3). Quand
                // elle ne nomme aucune chose, juste après un geste du même genre (« Tu le crées ou pas ? »), la phrase reste,
                // avec à côté ce que la conversation a fait (cinquième tour de la relecture R159).
                List<Done> thisTurn = same.stream().filter(now::contains).toList();
                contradicted.addAll(thisTurn);
                if (thisTurn.isEmpty() && pronounAfterAnAct(requested, same)) unsure.denial(said, same);
                continue;
            }
            List<Done> recent = same.stream().filter(Done::recent).toList();
            if (NEW.matcher(said.clause()).find() && recent.isEmpty()) continue;
            if (designation.weak() || recent.isEmpty()) {
                unsure.denial(said, same);
                continue;
            }
            contradicted.addAll(recent);
        }
        return contradicted;
    }

    /**
     * Les gestes faits dont peut parler cette proposition : du même genre, sur la même chose quand elle en nomme une, dans
     * le même système quand elle en nomme un. Ce qu'elle désigne en décide ensuite.
     */
    private static List<Done> sameKind(Said said, List<Done> done, Set<String> systems) {
        if (done.isEmpty()) return List.of();
        Set<Thing> things = thingsIn(said.clause());
        Set<String> named = systemsIn(said.clause(), systems);
        List<Done> same = new ArrayList<>();
        for (Done act : done) {
            if (!backs(kindsOf(act.tool()), said.kind())) continue;
            if (!things.isEmpty() && !things.contains(thingOf(act.tool()))) continue;
            if (!named.isEmpty() && named.stream().noneMatch(system -> system.equalsIgnoreCase(act.where()))) continue;
            same.add(act);
        }
        return same;
    }

    /**
     * Ce que la demande en cours demande de faire (second tour de la relecture R159 de la PR #548) : les genres de geste du
     * verbe de chacune de ses propositions qui écrivent ({@link Intent}), et les choses qu'elle nomme ; « Et un autre
     * projet ? » en demande un aussi.
     */
    private record Requested(Set<Kind> kinds, Set<Thing> things) {
        static final Requested NOTHING = new Requested(Set.of(), Set.of());

        /** La demande demande-t-elle ce geste, sur cette chose ? */
        boolean asks(Said said) {
            if (!kinds.contains(said.kind())) return false;
            Set<Thing> saidThings = thingsIn(said.clause());
            return saidThings.isEmpty() || things.isEmpty() || !Collections.disjoint(things, saidThings);
        }
    }

    private static Requested requested(String request) {
        if (request == null || request.isBlank()) return Requested.NOTHING;
        Set<Kind> kinds = EnumSet.noneOf(Kind.class);
        for (String verb : Intent.writeVerbs(request)) kinds.addAll(askedKinds(verb));
        Set<Thing> things = thingsIn(request);
        if (kinds.isEmpty() && !things.isEmpty() && Intent.asksForMore(request)) kinds.add(Kind.CREATE);
        return kinds.isEmpty() ? Requested.NOTHING : new Requested(kinds, things);
    }

    /** Ce que demande un verbe d'écriture, sans accents : « supprime », supprimer ; « passe », changer ; le reste, créer. */
    private static Set<Kind> askedKinds(String verb) {
        if (verb.startsWith("supprim") || verb.startsWith("effac") || verb.startsWith("retir") || verb.startsWith("enlev")
            || verb.startsWith("archiv") || Set.of("delete", "remove", "trash", "erase").contains(verb)) {
            return EnumSet.of(Kind.DELETE);
        }
        if (verb.startsWith("deplac") || verb.startsWith("boug") || "move".equals(verb)) return EnumSet.of(Kind.MOVE, Kind.UPDATE);
        if (verb.contains("assign") || verb.startsWith("attribu")) return EnumSet.of(Kind.ASSIGN, Kind.UPDATE);
        if (verb.startsWith("confi") || verb.startsWith("delegu") || "delegate".equals(verb)) return EnumSet.of(Kind.DELEGATE);
        if (verb.startsWith("modifi") || verb.startsWith("chang") || verb.startsWith("renomm") || verb.startsWith("ferm")
            || verb.startsWith("clotur") || verb.startsWith("marqu") || verb.startsWith("pass") || verb.startsWith("met")
            || Set.of("update", "edit", "modify", "rename", "set", "close", "reopen", "mark", "put").contains(verb)) {
            return EnumSet.of(Kind.UPDATE, Kind.MOVE, Kind.ASSIGN);
        }
        return EnumSet.of(Kind.CREATE);
    }

    /**
     * Ce qui désigne une chose dans une proposition. Nettement : une clé (« API-12 »), un titre cité, un nom propre (« le
     * projet Marketing », « the Marketing project », « le projet appelé Marketing »). Faiblement : ce dont elle parle
     * (« l'issue pour le bug du paiement », « le projet pour l'équipe Core »). Rien : « le projet », « ton projet », « pour
     * vous », « it », « je l'ai créé ». Le lieu (« dans TaskForce ») ne désigne pas la chose.
     */
    private record Designation(List<String> keys, List<String> titles, List<String> names, List<String> words) {
        /** Une clé, un titre cité, un nom propre : ce qui désigne nettement (second tour de la relecture R159). */
        boolean strong() {
            return !keys.isEmpty() || !titles.isEmpty() || !names.isEmpty();
        }

        /** Seulement ce dont parle la chose : une désignation incertaine. */
        boolean weak() {
            return !strong() && !words.isEmpty();
        }
    }

    private static final Pattern THING_WORD = Pattern.compile("\\b(?:issues?|cards?|tickets?|tasks?|bugs?|cartes?|"
        + "t[âa]ches?|projects?|projets?|comments?|commentaires?|notes?)\\b", FLAGS);
    private static final Pattern QUOTED = Pattern.compile("«\\s*([^»]{2,}?)\\s*»|\"([^\"]{2,})\"|“([^”]{2,})”");
    /** Ce qui dit de quoi parle une chose : « l'issue pour le bug », « the issue about login ». Une désignation faible. */
    private static final Set<String> DESCRIBED = Set.of("for", "about", "regarding", "pour", "concernant");
    /** Ce qui donne son nom à une chose : « le projet appelé Marketing », « the issue titled Login ». */
    private static final Set<String> NAMING = Set.of("named", "called", "titled", "nomme", "nommee", "appele", "appelee",
        "intitule", "intitulee");
    /** Un pronom : « pour vous », « for you » dit pour qui, pas quelle chose (second tour de la relecture R159). */
    private static final Set<String> PRONOUNS = Set.of("vous", "toi", "te", "t", "moi", "me", "m", "nous", "lui", "eux",
        "elle", "elles", "il", "ils", "you", "yourself", "yourselves", "him", "her", "them", "us", "it");
    /** Ce qui ouvre une autre proposition : ce dont parle la chose s'arrête là (« pour vous car vous ne m'avez pas... »). */
    private static final Set<String> STOPS = Set.of("car", "because", "since", "as", "parce", "puisque", "comme", "mais",
        "but", "so", "donc", "alors", "que", "qu", "qui", "that", "which", "who", "ou", "or", "si", "if", "when", "quand",
        "lorsque", "afin", "where", "while", "until", "sans", "without", "faute");
    /** Ce dont parle une chose, au plus : quelques mots. */
    private static final int MAX_DESCRIBED = 4;
    /** Ce qui situe une chose plutôt que la nommer : « le projet dans TaskForce ». */
    private static final Set<String> PLACED = Set.of("dans", "in", "into", "sur", "on", "chez", "at");
    private static final Set<String> FILLERS = Set.of("the", "a", "an", "le", "la", "les", "l", "un", "une", "des", "du",
        "de", "d", "of", "to", "and", "et", "with", "avec", "this", "that", "ce", "cet", "cette", "ces", "son", "sa", "ses",
        "its", "their", "leur", "leurs", "mon", "ma", "mes", "my", "your", "our", "votre", "notre", "q", "aucun", "aucune",
        "no", "any", "some", "every", "each", "all", "tout", "tous", "toute", "toutes", "chaque", "nul", "nulle", "ni", "n",
        // Les possessifs ne nomment pas la chose : « ton projet », « vos tâches » (second tour de la relecture R159).
        "ton", "ta", "tes", "vos", "nos", "yours", "ours", "his", "hers");

    private static Designation designation(Said said, Set<String> systems) {
        List<String> titles = new ArrayList<>();
        Matcher quoted = QUOTED.matcher(said.sentence());
        while (quoted.find()) {
            for (int g = 1; g <= 3; g++) {
                if (quoted.group(g) != null && !quoted.group(g).isBlank()) titles.add(TargetSystems.plain(quoted.group(g)).strip());
            }
        }
        List<String> names = new ArrayList<>();
        List<String> words = new ArrayList<>();
        Matcher thing = THING_WORD.matcher(said.clause());
        if (thing.find()) {
            // Avant la chose, en anglais : « the Marketing project ».
            String[] before = said.clause().substring(0, thing.start()).split("[^\\p{L}\\p{N}]+");
            for (int i = before.length - 1; i >= 0; i--) {
                String token = before[i];
                if (token.isEmpty() || isSystem(token, systems)) continue;
                String plain = TargetSystems.plain(token);
                if (FILLERS.contains(plain) || PRONOUNS.contains(plain) || !isName(token)) break;
                names.add(plain);
            }
            // Après elle : « le projet Marketing », « le projet appelé Marketing » (un nom) ; « the issue for the payment
            // bug », « pour l'équipe Core » (ce dont elle parle, même avec une majuscule : une désignation faible) ;
            // « pour vous » ne dit que pour qui.
            boolean described = false;
            boolean placed = false;
            for (String token : said.clause().substring(thing.end()).split("[^\\p{L}\\p{N}]+")) {
                if (token.isEmpty()) continue;
                String plain = TargetSystems.plain(token);
                if (isSystem(token, systems)) continue;
                if (PLACED.contains(plain)) {
                    placed = true;
                    continue;
                }
                if (DESCRIBED.contains(plain)) {
                    described = true;
                    placed = false;
                    continue;
                }
                if (NAMING.contains(plain)) {
                    described = false;
                    placed = false;
                    continue;
                }
                if (PRONOUNS.contains(plain) || STOPS.contains(plain)) break;
                if (FILLERS.contains(plain) || THING_WORD.matcher(token).matches()) continue;
                if (placed && isName(token)) continue;
                placed = false;
                if (described) {
                    if (plain.length() >= 3) words.add(plain);
                    if (words.size() >= MAX_DESCRIBED) break;
                    continue;
                }
                if (isName(token)) {
                    names.add(plain);
                    continue;
                }
                break;
            }
        }
        return new Designation(keysIn(said.clause()), titles, names, words);
    }

    /** Un nom plutôt qu'un mot : une majuscule, ou un chiffre (« Marketing », « TESTTASKFO », « Q4 »). */
    private static boolean isName(String token) {
        return token.length() >= 2 && (Character.isUpperCase(token.charAt(0)) || token.chars().anyMatch(Character::isDigit));
    }

    private static boolean isSystem(String token, Set<String> systems) {
        String plain = TargetSystems.plain(token);
        return systems.stream().anyMatch(system -> system != null && TargetSystems.plain(system).equals(plain));
    }

    /** Ce que la phrase désigne nettement est-il ce geste : sa clé, son titre ou son nom, dans ses arguments ou son résultat. */
    private static boolean designates(Designation said, Done act) {
        String identity = identity(act);
        if (!said.keys().isEmpty()) {
            String upper = identity.toUpperCase(Locale.ROOT);
            return said.keys().stream().anyMatch(upper::contains);
        }
        if (!said.titles().isEmpty()) return said.titles().stream().anyMatch(identity::contains);
        return said.names().stream().anyMatch(tokens(identity)::contains);
    }

    /** Ce dont parle la phrase est-il dans ce geste : un de ses mots, dans ses arguments ou son résultat. */
    private static boolean mentions(Designation said, Done act) {
        Set<String> tokens = tokens(identity(act));
        return said.words().stream().anyMatch(tokens::contains);
    }

    private static String identity(Done act) {
        return TargetSystems.plain((act.output() == null ? "" : act.output()) + " "
            + (act.arguments() == null ? "" : act.arguments()));
    }

    private static Set<String> tokens(String identity) {
        return Set.copyOf(List.of(identity.split("[^\\p{L}\\p{N}]+")));
    }

    /**
     * Ce sur quoi porte un outil, d'après le dernier mot de son nom ({@code create_project}, {@code linear__save_issue}) ;
     * null pour une autre chose ({@code create_issue_label} porte sur une étiquette).
     */
    static Thing thingOf(String tool) {
        if (tool == null) return null;
        int sep = tool.indexOf("__");
        String bare = (sep >= 0 ? tool.substring(sep + 2) : tool).replaceAll("(\\p{Ll})(\\p{Lu})", "$1_$2").toLowerCase(Locale.ROOT);
        String[] words = bare.split("[^a-z]+");
        if (words.length == 0) return null;
        String last = words[words.length - 1];
        for (Map.Entry<Thing, Pattern> thing : THINGS.entrySet()) {
            if (thing.getValue().matcher(last).matches()) return thing.getKey();
        }
        return null;
    }

    private static Set<Thing> thingsIn(String sentence) {
        Set<Thing> things = EnumSet.noneOf(Thing.class);
        THINGS.forEach((thing, pattern) -> { if (pattern.matcher(sentence).find()) things.add(thing); });
        return things;
    }

    /**
     * Les systèmes que la phrase nomme, parmi ceux que TaskForce connaît : un nom en un mot entier, un mot courant (Close,
     * Notion...) seulement après un lieu (« dans Notion »), comme dans une demande.
     */
    private static Set<String> systemsIn(String sentence, Set<String> systems) {
        Set<String> named = new LinkedHashSet<>();
        for (String system : systems) {
            if (system == null || system.isBlank()) continue;
            if (TargetSystems.names(sentence, system)) named.add(system);
        }
        return named;
    }

    private static List<String> keysIn(String sentence) {
        List<String> keys = new ArrayList<>();
        Matcher key = KEY_IN.matcher(sentence);
        while (key.find()) keys.add(key.group().toUpperCase(Locale.ROOT));
        return keys;
    }

    /** Ce qui a été fait et reste fait : la conversation, puis les gestes réussis du tour. */
    private static List<Done> doneIn(List<Done> thread, List<Ran> ran) {
        List<Done> done = new ArrayList<>(thread == null ? List.of() : thread);
        for (Ran call : ran) {
            if ("success".equals(call.status()) && !kindsOf(call.tool()).isEmpty()) {
                String connector = TargetSystems.connectorOf(call.tool());
                done.add(new Done(call.tool(), connector == null ? TargetSystems.TASKFORCE : TargetSystems.plainName(connector),
                    call.output(), null, true));
            }
        }
        return done;
    }

    /**
     * Les systèmes qu'une phrase peut nommer : ceux qu'on donne, TaskForce, tous les outils du catalogue, connectés ou non
     * (relecture R159 : « pas dans Linear » ne nie rien de fait dans TaskForce, Linear connecté ou pas, au rejeu aussi), et
     * ceux où les gestes ont été faits.
     */
    private static Set<String> names(Set<String> systems, List<Done> done) {
        Set<String> names = new LinkedHashSet<>(systems == null ? Set.of() : systems);
        names.add(TargetSystems.TASKFORCE);
        names.addAll(TargetSystems.catalogNames());
        done.forEach(act -> { if (act.where() != null) names.add(act.where()); });
        return names;
    }

    /**
     * Ce que dit TaskForce d'un geste qu'une phrase niait, ou dont elle parlait sans le désigner : qu'il a été fait, où, et
     * ce qu'il a fait, sans aucun texte libre de son résultat (troisième tour de la relecture R159 : un commentaire, un titre
     * peuvent venir du dehors, et ce bloc repart au modèle sous la signature de TaskForce).
     */
    private static String doneTruth(Done act) {
        String where = act.where() == null || act.where().isBlank() ? "" : ", in " + act.where();
        String output = ThreadActs.said(act.tool(), act.output()).replaceAll(" \\(id \\d+\\)", "")
            .replace(" in " + TargetSystems.TASKFORCE, "").strip();
        if (output.length() > 200) output = output.substring(0, 200).stripTrailing() + "...";
        Set<Kind> kinds = kindsOf(act.tool());
        String what = kinds.isEmpty() ? "done" : kinds.iterator().next().done();
        return output.isEmpty() ? "This was " + what + " in this conversation" + where + "."
            : "This was " + what + " in this conversation" + where + ": " + output;
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
        return RECORD_LINE.matcher(FORGED.matcher(text).replaceAll("")).replaceAll("");
    }

    /**
     * La ligne qui ouvre ce que TaskForce ajoute aux réponses d'avant pour le modèle ({@link ThreadActs#HEADER}) : le
     * modèle qui la recopie ne parle pas pour TaskForce, elle disparaît de sa réponse ; ce qu'il écrit dessous est relu
     * comme ses mots.
     */
    private static final Pattern RECORD_LINE = Pattern.compile("(?m)^[ \\t>]*\\[TaskForce record[^\\n]*\\n?",
        Pattern.CASE_INSENSITIVE);

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
