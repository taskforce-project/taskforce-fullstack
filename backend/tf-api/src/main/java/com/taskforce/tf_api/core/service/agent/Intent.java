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

    /** Une proposition de la demande : son texte, d'un seul tenant, et ce qu'elle fait. */
    record Clause(String text, Does does) {
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

    /** Un auxiliaire, une copule : le verbe qui suit raconte, il ne demande rien (« tu l'as créé », « was set »). */
    private static final Set<String> AUXILIARIES = Set.of("a", "as", "ai", "avons", "avez", "ont", "avait", "avaient", "ete",
        "etait", "etaient", "est", "sont", "sera", "seront", "has", "have", "had", "was", "were", "is", "are", "been",
        "being", "be", "ve", "d");

    /** Ce qui fait d'un mot un nom : « la liste », « the post », « any change ». */
    private static final Set<String> DETERMINERS = Set.of("le", "la", "les", "l", "un", "une", "des", "du", "de", "the", "an",
        "this", "that", "these", "those", "my", "your", "our", "their", "ce", "cet", "cette", "ces", "mon", "ma", "mes", "ton",
        "ta", "tes", "son", "sa", "ses", "notre", "votre", "nos", "vos", "leur", "leurs", "any", "some", "no", "each", "every",
        "all", "quelques", "aucun", "aucune", "chaque");

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
            if (does == null) {
                // Un morceau sans verbe : il complète la proposition d'avant (« ..., assignée à Marie, dans Linear »), ou
                // ouvre la suivante ; en tête de demande, un participe raconte (« Mergé sur GitHub, passe TF-12 en Done »).
                if (clauses.isEmpty() && PARTICIPLE.matcher(piece).find()) {
                    clauses.add(new Clause(piece.strip(), Does.NOTHING));
                } else if (clauses.isEmpty()) {
                    leading.append(piece).append(' ');
                } else {
                    Clause last = clauses.remove(clauses.size() - 1);
                    clauses.add(new Clause(last.text() + ", " + piece.strip(), last.does()));
                }
                continue;
            }
            String text = leading.isEmpty() ? piece.strip() : (leading + piece).strip();
            leading.setLength(0);
            clauses.add(new Clause(text, does));
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
     * demande en cours demande de faire (second tour de la relecture R159 de la PR #548).
     */
    static List<String> writeVerbs(String request) {
        List<String> verbs = new ArrayList<>();
        for (Clause clause : clauses(request)) {
            if (clause.does() != Does.WRITE) continue;
            List<String> words = words(clause.text());
            int at = writeAt(words);
            if (at >= 0) verbs.add(words.get(at));
        }
        return verbs;
    }

    /** Ce qui en veut une de plus sans verbe : « Et un autre projet ? », « un nouveau, stp ». */
    private static final Set<String> MORE = Set.of("autre", "autres", "another", "other", "nouveau", "nouvelle", "nouveaux",
        "nouvelles", "nouvel", "new", "encore", "more");

    /**
     * Une demande sans verbe qui en veut une de plus (« Et un autre projet ? ») : elle demande d'en créer une. Pas une
     * question (« Quels sont les nouveaux projets ? »), ni une lecture (« montre les nouveaux projets »).
     */
    static boolean asksForMore(String request) {
        List<String> words = words(request == null ? "" : request);
        if (words.isEmpty() || QUESTIONS.contains(words.get(0))) return false;
        return words.stream().noneMatch(Intent::isVerb) && words.stream().anyMatch(MORE::contains);
    }

    /** Les mots d'un morceau, sans accents ni ponctuation. */
    private static List<String> words(String piece) {
        List<String> words = new ArrayList<>();
        for (String token : TargetSystems.plain(piece).split("[^\\p{L}\\p{N}]+")) if (!token.isEmpty()) words.add(token);
        return words;
    }

    /** La place du premier verbe d'écriture qui demande, dans ces mots ; -1 sans lui. */
    private static int writeAt(List<String> words) {
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
        if (writeAt(words) >= 0) return Does.WRITE;
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
        if (i > 0 && DETERMINERS.contains(words.get(i - 1)) && !infinitive) return false;
        int j = i - 1;
        while (j >= 0 && CLITICS.contains(words.get(j))) j--;
        if (j >= 0 && AUXILIARIES.contains(words.get(j))) return false;
        if (AMBIGUOUS.contains(verb)) {
            for (int k = 0; k < i; k++) if (!LEADS.contains(words.get(k)) && !CLITICS.contains(words.get(k))) return false;
        }
        if (verb.startsWith("pass")) {
            // « passe TF-12 en Done », « passe-la à Marie » : un changement d'état ou de main, pas « passe par Linear ».
            return words.subList(i + 1, words.size()).stream()
                .anyMatch(word -> Set.of("en", "a", "au", "aux", "dans", "sur", "vers", "to").contains(word));
        }
        return true;
    }
}
