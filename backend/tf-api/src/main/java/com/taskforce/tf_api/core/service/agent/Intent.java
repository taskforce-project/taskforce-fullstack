package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Ce qu'une demande veut faire, proposition par proposition (R204, relecture R159 de la PR #548) : écrire (créer,
 * modifier, supprimer), lire, ou rien (un constat : « c'est mergé sur GitHub »). L'intention d'écrire se lit sur un verbe
 * d'action à l'impératif ou à l'infinitif, jamais sur un mot isolé : « qu'est-ce qui se passe », « les nouveaux
 * tickets », « ce qui a été fait », « tu l'as créé ? » n'écrivent rien. Du code seulement, en français comme en anglais.
 */
final class Intent {

    private Intent() {
    }

    /** Ce que fait une proposition. */
    enum Does { WRITE, READ, NOTHING }

    /**
     * Une proposition de la demande : son texte, d'un seul tenant, ce qu'elle fait, et si elle est posée en question
     * ({@code asked}, troisième tour de la relecture R159 de la PR #548).
     */
    record Clause(String text, Does does, boolean asked) {
        Clause(String text, Does does) {
            this(text, does, false);
        }
    }

    /** Où une proposition finit : une ponctuation, ou une conjonction qui en ouvre une autre. */
    private static final Pattern SEPARATOR = Pattern.compile("[.!?;:]+|,|\\s(?:et|puis|ensuite|then|and|après|apres)\\s+",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /** Les verbes d'une écriture, sans accents, à l'impératif, à l'infinitif ou à la deuxième personne. */
    private static final Set<String> WRITES = Set.of(
        "cree", "creer", "crees", "creez", "creons", "ajoute", "ajouter", "ajoutes", "ajoutez", "redige", "rediger", "redigez",
        "ecris", "ecrire", "ecrivez", "poste", "poster", "postez", "publie", "publier", "publiez", "commente", "commenter",
        "commentez", "envoie", "envoyer", "envoyez", "modifie", "modifier", "modifiez", "change", "changer", "changez",
        "mets", "mettre", "mettez", "deplace", "deplacer", "deplacez", "bouge", "bouger", "bougez", "renomme", "renommer",
        "renommez", "assigne", "assigner", "assignez", "attribue", "attribuer", "attribuez", "reassigne", "reassigner",
        "ferme", "fermer", "fermez", "cloture", "cloturer", "marque", "marquer", "marquez", "passe", "passer", "passez",
        "confie", "confier", "confiez", "delegue", "deleguer", "archive", "archiver", "archivez", "supprime", "supprimer",
        "supprimez", "efface", "effacer", "effacez", "retire", "retirer", "retirez", "enleve", "enlever", "enlevez",
        "copie", "copier", "copiez", "duplique", "dupliquer", "importe", "importer", "exporte", "exporter",
        // L'anglais ; « change » et « archive » sont déjà là, communs aux deux langues.
        "create", "add", "write", "post", "publish", "comment", "send", "update", "edit", "modify", "rename", "move", "set",
        "assign", "reassign", "unassign", "close", "reopen", "mark", "delegate", "delete", "remove", "trash", "file", "copy",
        "duplicate", "import", "export", "put", "draft");

    /** Des verbes qui sont aussi des noms (« the post », « a PDF file ») : verbes en tête de proposition, ou après « to ». */
    private static final Set<String> AMBIGUOUS = Set.of("file", "post", "comment", "copy", "change", "set", "mark", "close",
        "move", "archive", "export", "import", "draft", "update", "put", "trash", "duplicate");

    /** Un infinitif français : un verbe même après « l' », « le », « de » (« peux-tu l'archiver », « merci de créer »). */
    private static final Pattern INFINITIVE = Pattern.compile("(?:er|ir|re)$");

    /** Les verbes d'une lecture : lister, montrer, chercher, résumer... */
    private static final Set<String> READS = Set.of(
        "liste", "lister", "listez", "montre", "montrer", "montrez", "affiche", "afficher", "affichez", "cherche", "chercher",
        "cherchez", "trouve", "trouver", "trouvez", "vois", "voir", "voit", "voyez", "lis", "lire", "lisez", "regarde",
        "regarder", "regardez", "resume", "resumer", "resumez", "recapitule", "recapituler", "donne", "donner", "donnez",
        "dis", "dire", "dites", "explique", "expliquer", "expliquez", "verifie", "verifier", "verifiez", "ouvre", "ouvrir",
        "list", "show", "find", "search", "look", "see", "read", "get", "give", "summarize", "summarise", "check", "tell",
        "explain", "fetch", "open", "browse");

    /**
     * Un auxiliaire, une copule : le verbe qui suit raconte, il ne demande rien (« tu l'as créé », « was set », « did you
     * create », « didn't you create »). « ta », « tas », « las » sont « t'as », « l'as » tapés vite (« Ta creer le
     * projet ? », « Tu las creer ou ? », cinquième tour de la relecture R159) : devant un verbe, jamais un article.
     */
    private static final Set<String> AUXILIARIES = Set.of("a", "as", "ai", "avons", "avez", "ont", "avait", "avaient", "ete",
        "etait", "etaient", "est", "sont", "sera", "seront", "has", "have", "had", "was", "were", "is", "are", "been",
        "being", "be", "ve", "d", "did", "do", "does", "didn", "don", "doesn", "hasn", "haven", "hadn", "wasn", "weren",
        "isn", "aren", "ta", "tas", "las");
    /**
     * Ce qui se glisse entre l'auxiliaire et le verbe sans rien changer au temps : une négation, un adverbe, le sujet d'une
     * question (« tu l'as bien créé », « tu ne l'as pas créé », « t'as vraiment créé », « as-tu créé », « did you really
     * create »), troisième tour de la relecture R159.
     */
    private static final Set<String> BETWEEN = Set.of("ne", "n", "pas", "plus", "jamais", "rien", "point", "bien",
        "vraiment", "deja", "encore", "aussi", "toujours", "effectivement", "finalement", "tu", "vous", "il", "elle", "on",
        "nous", "ils", "elles", "not", "never", "really", "actually", "already", "ever", "yet", "just", "also", "finally",
        "indeed", "truly", "you", "we", "they", "he", "she", "it", "i");

    /** Ce qui fait d'un mot un nom : « la liste », « the post », « any change », « quel poste ». */
    private static final Set<String> DETERMINERS = Set.of("le", "la", "les", "l", "un", "une", "des", "du", "de", "the", "an",
        "this", "that", "these", "those", "my", "your", "our", "their", "ce", "cet", "cette", "ces", "mon", "ma", "mes", "ton",
        "ta", "tes", "son", "sa", "ses", "notre", "votre", "nos", "vos", "leur", "leurs", "any", "some", "no", "each", "every",
        "all", "quelques", "aucun", "aucune", "chaque", "quel", "quels", "quelle", "quelles", "which", "what", "whose");

    /** Les pronoms qu'un verbe porte devant lui sans changer ce qu'il fait : « me crée », « l'ajoute ». */
    private static final Set<String> CLITICS = Set.of("l", "le", "la", "les", "lui", "leur", "me", "m", "te", "t", "nous",
        "vous", "en", "y");

    /** Ce qui précède un verbe en tête de demande sans en faire un nom : la politesse, une modalité. */
    private static final Set<String> LEADS = Set.of("please", "pls", "stp", "svp", "can", "could", "would", "will", "you",
        "tu", "vous", "peux", "peut", "pouvez", "pourrais", "pourriez", "veux", "voudrais", "voudriez", "merci", "de", "d",
        "il", "faut", "je", "j", "aimerais", "que", "go", "ahead", "and", "now", "maintenant", "ensuite", "then", "also",
        "aussi", "et", "puis", "alors", "ok", "okay", "oui", "yes", "accord", "hey", "salut", "bonjour", "me", "m", "nous",
        "lui", "let", "lets", "us", "to", "need", "want", "should", "must", "i");

    /** Ce qui ouvre une question : « qu'est-ce », « quels », « où », « what », « is ». */
    private static final Set<String> QUESTIONS = Set.of("qu", "que", "quest", "quels", "quelles", "quel", "quelle", "quoi",
        "ou", "comment", "combien", "pourquoi", "qui", "what", "which", "where", "how", "who", "why", "when", "is", "are",
        "do", "does", "did", "y");

    /**
     * Un mot interrogatif : en tête d'une proposition, elle demande, elle n'écrit pas (« Comment avance le projet dans
     * Linear ? », « Quel poste occupe Marie ? », « How do I create an issue? »), second tour de la relecture R159.
     * « ou », sans accent, n'en est un que dans une question.
     */
    private static final Set<String> INTERROGATIVES = Set.of("comment", "quel", "quels", "quelle", "quelles", "pourquoi",
        "combien", "quoi", "qui", "que", "qu", "quest", "ou", "what", "which", "where", "how", "who", "whom", "whose", "why",
        "when");

    /** Un constat : une copule, un participe passé (« c'est mergé », « it was moved »). */
    private static final Set<String> STATEMENTS = Set.of("est", "sont", "etait", "etaient", "ete", "is", "are", "was", "were",
        "has", "have", "had", "s");
    private static final Pattern PARTICIPLE = Pattern.compile("(?<![\\p{L}\\p{N}])\\p{L}+(?:é|ée|és|ées|ed)(?![\\p{L}\\p{N}])",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /**
     * Les propositions de la demande, dans l'ordre. Un morceau sans verbe (« et le paiement dans Linear », « Dans Linear »)
     * appartient à la proposition d'avant, ou à la suivante quand il ouvre la demande ; un constat n'en est pas un.
     */
    static List<Clause> clauses(String request) {
        List<Clause> clauses = new ArrayList<>();
        if (request == null || request.isBlank()) return clauses;
        List<String> pieces = new ArrayList<>();
        List<Boolean> asked = new ArrayList<>();
        Matcher separator = SEPARATOR.matcher(request);
        int from = 0;
        while (separator.find()) {
            pieces.add(request.substring(from, separator.start()));
            asked.add(separator.group().contains("?"));
            from = separator.end();
        }
        pieces.add(request.substring(from));
        asked.add(false);
        StringBuilder leading = new StringBuilder();
        for (int i = 0; i < pieces.size(); i++) {
            String piece = pieces.get(i);
            if (piece.isBlank()) continue;
            Does does = does(piece, asked.get(i));
            // Une question se relit avec le morceau sans verbe qui l'ouvre : « Le projet, cree ou pas ? » (quatrième tour).
            if (does != null && !leading.isEmpty()) does = does(leading + piece, asked.get(i));
            if (does == null) {
                // Un morceau sans verbe : il complète la proposition d'avant (« ..., assignée à Marie, dans Linear »), ou
                // ouvre la suivante ; en tête de demande, un participe raconte (« Mergé sur GitHub, passe TF-12 en Done »).
                if (clauses.isEmpty() && PARTICIPLE.matcher(piece).find()) {
                    clauses.add(new Clause(piece.strip(), Does.NOTHING));
                } else if (clauses.isEmpty()) {
                    leading.append(piece).append(' ');
                } else {
                    Clause last = clauses.remove(clauses.size() - 1);
                    clauses.add(new Clause(last.text() + ", " + piece.strip(), last.does(), last.asked() || asked.get(i)));
                }
                continue;
            }
            String text = leading.isEmpty() ? piece.strip() : (leading + piece).strip();
            leading.setLength(0);
            clauses.add(new Clause(text, does, asked.get(i)));
        }
        if (!leading.isEmpty()) clauses.add(new Clause(leading.toString().strip(), Does.NOTHING));
        return clauses;
    }

    /** Un verbe de lecture ou d'écriture, sans accents : ce qui fait d'un outil qui le suit l'objet de l'action. */
    static boolean isVerb(String plainWord) {
        return WRITES.contains(plainWord) || READS.contains(plainWord);
    }

    /** La demande écrit-elle quelque chose, d'après le verbe d'une de ses propositions ? */
    static boolean writes(String request) {
        return clauses(request).stream().anyMatch(clause -> clause.does() == Does.WRITE);
    }

    /**
     * Le verbe d'écriture de chaque proposition qui écrit, sans accents (« cree », « supprime », « add ») : ce que la
     * demande en cours demande de faire (second tour de la relecture R159 de la PR #548). Les mêmes propositions que
     * {@link #writes} : une question s'y lit pareil (quatrième tour).
     */
    static List<String> writeVerbs(String request) {
        List<String> verbs = new ArrayList<>();
        for (Clause clause : clauses(request)) {
            if (clause.does() != Does.WRITE) continue;
            List<String> words = words(clause.text());
            int at = writeAt(words, clause.asked());
            if (at >= 0) verbs.add(words.get(at));
        }
        return verbs;
    }

    /** Les modalités qui font d'un infinitif une demande : « peux-tu la créer », « tu vas la créer », « il faut la créer ». */
    private static final Set<String> MODALS = Set.of("peux", "peut", "pouvez", "pourrais", "pourrait", "pourriez", "veux",
        "veut", "voulez", "voudrais", "voudriez", "vas", "va", "allez", "vais", "dois", "doit", "devez", "faut");
    /** Les sujets : « la » qui les suit est un pronom, pas un article (« tu la crées »). */
    private static final Set<String> SUBJECTS = Set.of("je", "j", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles");
    /** Des choses : un nom devant le verbe d'une question en fait un participe (« le projet cree ou pas ? »). */
    private static final Set<String> NOUNS = Set.of("projet", "projets", "project", "projects", "issue", "issues", "tache",
        "taches", "task", "tasks", "ticket", "tickets", "carte", "cartes", "card", "cards", "bug", "bugs", "page", "pages",
        "note", "notes", "commentaire", "commentaires", "comment", "comments", "document", "documents", "doc", "docs");
    /** Des mots de liaison, qui ne sont pas des noms : « du coup », « bon », « donc ». */
    private static final Set<String> LINKS = Set.of("coup", "bon", "donc", "alors", "sinon", "ensuite", "puis", "enfin",
        "bref", "ok", "okay");

    /**
     * Une question demande d'écrire (quatrième tour de la relecture R159 de la PR #548), sauf quand son verbe dit le passé
     * ou qu'un nom le précède : un participe (« créé ou pas ? ») ; après « tu » ou « vous » et leurs pronoms, un verbe qui
     * n'a pas leur marque, la question de la recette tapée vite (« tu la creer ou ? », pour « tu l'as créé ? ») ; « le
     * projet cree ou pas ? ». « Tu la crées ? », « Tu peux la créer ? », « On crée aussi le projet ? », « Could you just
     * create... ? » demandent.
     */
    private static boolean request(List<String> words, int at, List<String> original) {
        if (at < original.size() && participle(original.get(at))) return false;
        if (pastAfterSubject(words, at)) return false;
        return !nounBefore(words, at);
    }

    /**
     * Après « tu » ou « vous », et les pronoms qui les suivent, un verbe sans leur marque (« -s », « -ez ») : « tu la
     * creer ? », « tu la cree ? », « vous le creer ou pas ? » disent le passé ; « tu la crées ? », « vous le créez ? », une
     * modalité devant le sujet (« peux-tu la créer ? ») demandent.
     */
    private static boolean pastAfterSubject(List<String> words, int at) {
        for (int k = at - 1; k >= 0; k--) {
            String word = words.get(k);
            if ("tu".equals(word) || "vous".equals(word)) {
                if (k > 0 && MODALS.contains(words.get(k - 1))) return false;
                String verb = words.get(at);
                return "tu".equals(word) ? !verb.endsWith("s") : !verb.endsWith("ez");
            }
            if (!CLITICS.contains(word) && !"ne".equals(word) && !"n".equals(word)) return false;
        }
        return false;
    }

    /** Un nom juste devant le verbe : une chose (« projet »), ou un mot qu'un article ouvre ; pas un pronom, ni une liaison. */
    private static boolean nounBefore(List<String> words, int at) {
        if (at == 0) return false;
        String word = words.get(at - 1);
        if (LEADS.contains(word) || CLITICS.contains(word) || BETWEEN.contains(word) || AUXILIARIES.contains(word)
            || MODALS.contains(word) || SUBJECTS.contains(word) || LINKS.contains(word) || DETERMINERS.contains(word)) {
            return false;
        }
        return NOUNS.contains(word) || at >= 2 && DETERMINERS.contains(words.get(at - 2));
    }

    /** « la » dans « tu la crées », « on la crée », « tu me la crées » : un pronom qui suit un sujet ou un autre pronom. */
    private static boolean objectPronoun(List<String> words, int k) {
        if (k == 0 || !Set.of("le", "la", "les", "l").contains(words.get(k))) return false;
        String before = words.get(k - 1);
        return SUBJECTS.contains(before) || CLITICS.contains(before) || "ne".equals(before) || "n".equals(before);
    }

    /** Les mots d'un morceau tels qu'il les écrit, en minuscules, accents compris : un participe s'y reconnaît. */
    private static List<String> originalWords(String piece) {
        List<String> words = new ArrayList<>();
        for (String token : piece.toLowerCase(java.util.Locale.ROOT).replace('’', '\'').split("[^\\p{L}\\p{N}]+")) {
            if (!token.isEmpty()) words.add(token);
        }
        return words;
    }

    /**
     * Un participe français, à ses accents : « créé », « créées », « ajouté », « supprimée » ; pas « crée », « ajoute ».
     * Sans accents, rien ne le distingue de l'impératif.
     */
    static boolean participle(String word) {
        String base = word.endsWith("s") ? word.substring(0, word.length() - 1) : word;
        if (base.startsWith("cré") || base.startsWith("recré")) return base.contains("éé");
        if (base.endsWith("e")) base = base.substring(0, base.length() - 1);
        return base.endsWith("é");
    }

    /**
     * Ce qui en veut une de plus sans verbe : « un nouveau », « a new », « un autre », « another », « encore un ». « Le
     * nouveau projet », « l'autre » parlent d'une chose déjà là (troisième tour de la relecture R159).
     */
    private static final Pattern MORE = Pattern.compile("(?<![\\p{L}\\p{N}])(?:un\\s+nouve(?:au|l)|une\\s+nouvelle|de\\s+nouve"
        + "(?:aux|lles)|d\\s+autres|une?\\s+autre|a\\s+new|another|encore\\s+une?|one\\s+more)(?![\\p{L}\\p{N}])");

    /**
     * Une demande sans verbe qui en veut une de plus (« Et un autre projet ? ») : elle demande d'en créer une. Pas une
     * question (« Quels sont les nouveaux projets ? »), ni une lecture (« montre les nouveaux projets »), ni une chose
     * déjà là (« Et le nouveau projet ? »).
     */
    static boolean asksForMore(String request) {
        List<String> words = words(request == null ? "" : request);
        if (words.isEmpty() || QUESTIONS.contains(words.get(0))) return false;
        return words.stream().noneMatch(Intent::isVerb) && MORE.matcher(String.join(" ", words)).find();
    }

    /** Les mots d'un morceau, sans accents ni ponctuation. */
    private static List<String> words(String piece) {
        List<String> words = new ArrayList<>();
        for (String token : TargetSystems.plain(piece).split("[^\\p{L}\\p{N}]+")) if (!token.isEmpty()) words.add(token);
        return words;
    }

    /**
     * La place du premier verbe d'écriture qui demande, dans ces mots ; -1 sans lui, et derrière un mot interrogatif en
     * tête. « Comment on TF-12: ... » écrit : c'est l'impératif anglais, hors d'une question.
     */
    private static int writeAt(List<String> words, boolean question) {
        if (!words.isEmpty() && INTERROGATIVES.contains(words.get(0)) && (question || !"ou".equals(words.get(0)))) {
            boolean commentOn = "comment".equals(words.get(0)) && words.size() > 1 && "on".equals(words.get(1));
            if (question || !commentOn) return -1;
        }
        for (int i = 0; i < words.size(); i++) {
            if (WRITES.contains(words.get(i)) && writesAt(words, i)) return i;
        }
        return -1;
    }

    /**
     * Ce que fait un morceau : écrire, lire, rien (un constat, par sa copule) ; null pour un morceau sans verbe ni question,
     * un participe seul compris, qui décrit ce qu'écrit la proposition d'avant.
     */
    static Does does(String piece, boolean question) {
        List<String> words = words(piece);
        int at = writeAt(words, question);
        // Une question demande d'écrire, sauf quand son verbe dit le passé ou qu'un nom le précède (quatrième tour).
        if (at >= 0 && (!question || request(words, at, originalWords(piece)))) return Does.WRITE;
        boolean reads = question || !words.isEmpty() && QUESTIONS.contains(words.get(0));
        for (int i = 0; i < words.size() && !reads; i++) {
            reads = READS.contains(words.get(i)) && (i == 0 || !DETERMINERS.contains(words.get(i - 1)));
        }
        if (reads) return Does.READ;
        return words.stream().anyMatch(STATEMENTS::contains) ? Does.NOTHING : null;
    }

    /** Le mot à cette place est-il un verbe d'écriture qui demande, plutôt qu'un nom, un passé ou un pronominal ? */
    private static boolean writesAt(List<String> words, int i) {
        String verb = words.get(i);
        if (i > 0 && ("se".equals(words.get(i - 1)) || "s".equals(words.get(i - 1)))) return false;
        boolean infinitive = verb.length() > 4 && INFINITIVE.matcher(verb).find();
        if (i > 0 && DETERMINERS.contains(words.get(i - 1)) && !infinitive && !objectPronoun(words, i - 1)) return false;
        int j = i - 1;
        while (j >= 0 && (CLITICS.contains(words.get(j)) || BETWEEN.contains(words.get(j)))) j--;
        if (j >= 0 && AUXILIARIES.contains(words.get(j))) return false;
        if (AMBIGUOUS.contains(verb)) {
            for (int k = 0; k < i; k++) if (!LEADS.contains(words.get(k)) && !CLITICS.contains(words.get(k))) return false;
        }
        // « comment » n'écrit qu'en anglais, suivi de « on » (« comment on TF-12 ») : en français, c'est « how ».
        if ("comment".equals(verb)) return i + 1 < words.size() && "on".equals(words.get(i + 1));
        if (verb.startsWith("pass")) {
            // « passe TF-12 en Done », « passe-la à Marie » : un changement d'état ou de main, pas « passe par Linear ».
            return words.subList(i + 1, words.size()).stream()
                .anyMatch(word -> Set.of("en", "a", "au", "aux", "dans", "sur", "vers", "to").contains(word));
        }
        return true;
    }
}
