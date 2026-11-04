package com.taskforce.tf_api.core.service.agent;

import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Le genre d'une demande, lu dans ses mots par du code (R118, séance n°17) : elle se sert des outils de TaskForce, elle
 * parle de code, elle est en français ou en anglais ; et sa taille, en mots, avec l'historique que le modèle relira. La
 * banque dit ensuite si le modèle choisi échoue ce genre de demande. Aucun modèle ne classe : un classement raté
 * ne ferait que taire ou montrer une proposition, jamais changer de modèle.
 */
public final class RequestKinds {

    /** Les genres de la demande, et le nombre de mots que le modèle lira avec elle (l'historique compris). */
    public record Request(Set<Capability> kinds, int words) {
        public Request {
            kinds = kinds.isEmpty() ? Set.of() : Set.copyOf(kinds);
        }
    }

    private static final Pattern ISSUE_KEY = Pattern.compile("\\b[A-Z][A-Z0-9]{1,9}-\\d{1,6}\\b");
    private static final Pattern CODE = Pattern.compile(
        "```|`[^`\\n]+`|=>|console\\.log|\\bprint\\(|#include|\\bdef\\s+\\w+\\(|\\bfunction\\s*\\w*\\(|"
            + "\\b(javascript|typescript|python|java|sql|regex|regexp|bash|shell script|stack ?trace)\\b",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern WORD = Pattern.compile("[\\p{L}']+");
    private static final Pattern ACCENT = Pattern.compile("[éèêëàâùûçôîï]");

    /**
     * Ce qu'on demande à TaskForce de faire ou de lire : un geste, un objet de l'espace. Des mots entiers, puis des
     * débuts de mots, qui gardent les formes et les fautes de frappe (« suprime testta 2 », le 02/11/2026).
     */
    private static final Set<String> TOOL_WORDS = Set.of(
        "add", "make", "move", "set", "mark", "list", "show", "find", "search", "close", "reopen", "hand", "task", "tasks",
        "board", "column", "backlog", "sprint", "cycle", "milestone",
        "mets", "mettre", "liste", "lister", "ferme", "fermer", "rouvre", "marque", "trouve", "change", "changer", "confie",
        "confier", "carte", "cartes", "tableau", "colonne", "colonnes");
    private static final List<String> TOOL_STEMS = List.of(
        "creat", "delet", "remov", "archiv", "renam", "updat", "assign", "delegat", "issue", "project", "ticket",
        "supprim", "suprim", "crée", "cree", "ajout", "dépla", "depla", "renomm", "modifi", "montr", "affich", "cherch",
        "commenta", "commente", "délég", "tâche", "tache", "projet");

    private static final Set<String> FRENCH_WORDS = Set.of(
        "le", "la", "les", "des", "du", "un", "une", "est", "et", "pour", "dans", "que", "qui", "pas", "sur", "avec", "au",
        "aux", "ce", "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses", "je", "tu", "il", "elle",
        "nous", "vous", "ils", "elles", "moi", "toi", "lui", "leur", "sont", "fait", "faire", "peux", "peut", "quoi",
        "quand", "comment", "pourquoi", "combien", "c'est", "qu'il", "s'il", "merci", "stp", "svp");

    private static final Set<String> ENGLISH_WORDS = Set.of(
        "the", "is", "are", "was", "an", "and", "for", "in", "that", "which", "not", "with", "of", "to", "this", "these",
        "my", "i", "you", "it", "we", "they", "what", "how", "why", "when", "where", "who", "please", "can", "could",
        "there", "from", "do", "does", "it's", "what's");

    private RequestKinds() {
    }

    /** Le genre de {@code message}, et sa taille avec {@code history} (messages {@code {role, content}}). */
    public static Request of(String message, List<Map<String, Object>> history) {
        String text = message == null ? "" : message;
        Set<Capability> kinds = EnumSet.noneOf(Capability.class);
        List<String> words = WORD.matcher(text.toLowerCase(Locale.ROOT)).results().map(m -> m.group()).toList();
        if (ISSUE_KEY.matcher(text).find() || words.stream().anyMatch(RequestKinds::toolWord)) {
            kinds.add(Capability.TOOLS);
        }
        if (CODE.matcher(text).find()) {
            kinds.add(Capability.CODE);
        }
        long french = words.stream().filter(w -> FRENCH_WORDS.contains(w) || ACCENT.matcher(w).find()).count();
        long english = words.stream().filter(ENGLISH_WORDS::contains).count();
        if (french > english) kinds.add(Capability.FRENCH);
        else if (english > french) kinds.add(Capability.ENGLISH);
        int total = CapabilitySuite.wordCount(text);
        if (history != null) {
            for (Map<String, Object> turn : history) {
                Object content = turn.get("content");
                if (content != null) total += CapabilitySuite.wordCount(content.toString());
            }
        }
        return new Request(kinds, total);
    }

    private static boolean toolWord(String word) {
        return TOOL_WORDS.contains(word) || TOOL_STEMS.stream().anyMatch(word::startsWith);
    }
}
