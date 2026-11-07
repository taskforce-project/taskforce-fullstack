package com.taskforce.tf_api.core.service.mcpserver;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.IntStream;

import com.taskforce.tf_api.core.service.agent.tools.IssueFields;

/**
 * Les dépôts de la personne face à ce qu'elle écrit, pour la question « où vit son code » (test du CEO du 05/11/2026 :
 * « test-taskforce est un repo normalement nan ? » ne se lisait pas comme son dépôt, et la même carte revenait). Tout se
 * compare sans la casse, les accents, les espaces, les tirets ni la ponctuation ({@link IssueFields#key}), le
 * propriétaire facultatif. Les dépôts arrivent du plus récemment actif au plus ancien : à égalité, cet ordre reste.
 */
final class RepoMatch {

    /** Un {@code owner/name} écrit dans une phrase. */
    private static final Pattern FULL_NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}");
    /** Le plus long nom de dépôt lu dans une phrase, en mots. */
    private static final int MAX_WORDS = 8;
    /** Un nom plus court ne se cherche pas dans une phrase : « go », « a » y seraient partout. */
    private static final int MIN_IN_SENTENCE = 3;
    /**
     * Au-dessus, un dépôt ressemble à ce qui est écrit : « test-tasforce » pour « test-taskforce ». En dessous, deux mots
     * courts se ressemblent par hasard (« notes » et « nextjs » partagent la moitié de leurs lettres).
     */
    static final double CLOSE = 0.6;
    /** Au-dessus, la réponse dit presque ce nom, à une faute de frappe près. */
    private static final double NEAR = 0.85;

    private static final Set<String> NEW_WORDS = Set.of("new", "nouveau", "nouvelle", "creer", "cree", "creez", "creates",
        "create");
    private static final Set<String> PRIVATE_WORDS = Set.of("private", "prive", "privee");
    private static final Set<String> PUBLIC_WORDS = Set.of("public", "publique");

    private RepoMatch() {}

    /**
     * Les dépôts que la réponse nomme : toute la réponse ({@code owner/name}, ou le nom seul), un {@code owner/name}
     * écrit dans une phrase, ou le nom d'un dépôt dit en mots entiers à la suite (« test taskforce est un repo »). Le nom
     * le plus long l'emporte (« test-taskforce » plutôt que « test ») ; plusieurs dépôts de même nom chez des
     * propriétaires différents restent tous. Vide quand rien ne nomme un de ses dépôts.
     */
    static List<String> matching(String said, List<String> repos) {
        String whole = IssueFields.key(said);
        if (whole.isEmpty() || repos.isEmpty()) return List.of();
        List<String> exact = repos.stream()
            .filter(repo -> whole.equals(IssueFields.key(repo)) || whole.equals(IssueFields.key(name(repo))))
            .toList();
        if (!exact.isEmpty()) return exact;
        Set<String> written = new LinkedHashSet<>();
        Matcher full = FULL_NAME.matcher(said);
        while (full.find()) {
            String found = full.group();
            repos.stream().filter(repo -> repo.equalsIgnoreCase(found)).forEach(written::add);
        }
        if (!written.isEmpty()) return List.copyOf(written);
        List<String> words = words(said);
        int longest = 0;
        List<String> found = new ArrayList<>();
        for (String repo : repos) {
            String name = IssueFields.key(name(repo));
            if (name.length() < MIN_IN_SENTENCE || !said(words, name)) continue;
            if (name.length() > longest) {
                longest = name.length();
                found.clear();
            }
            if (name.length() == longest) found.add(repo);
        }
        // Un dépôt au nom plus long que la réponse dit à une lettre près (« test tasforce » pour test-taskforce, quand
        // « test » existe aussi) : la réponse est ambiguë, les deux se proposent.
        if (!found.isEmpty()) {
            for (String repo : repos) {
                String name = IssueFields.key(name(repo));
                if (name.length() > longest && !found.contains(repo) && nearest(words, name) >= NEAR) found.add(repo);
            }
        }
        return found;
    }

    /** La part commune la plus haute entre le nom et un bout de la phrase, lettre à lettre. */
    private static double nearest(List<String> words, String name) {
        double best = 0;
        for (int start = 0; start < words.size(); start++) {
            StringBuilder joined = new StringBuilder();
            for (int end = start; end < words.size() && end - start < MAX_WORDS; end++) {
                joined.append(words.get(end));
                String piece = joined.toString();
                best = Math.max(best, 1 - (double) distance(piece, name) / Math.max(piece.length(), name.length()));
                if (piece.length() > name.length() * 2) break;
            }
        }
        return best;
    }

    /**
     * Les dépôts les plus proches de ce qui est écrit, quand aucun n'est nommé : ceux qui lui ressemblent, les plus
     * ressemblants d'abord ; sans ressemblance, les plus récents. {@code limit} au plus.
     */
    static List<String> closest(String said, List<String> repos, int limit) {
        List<String> words = words(said);
        List<String> close = IntStream.range(0, repos.size()).boxed()
            .filter(i -> similarity(repos.get(i), words) >= CLOSE)
            .sorted(Comparator.comparingDouble((Integer i) -> -similarity(repos.get(i), words)).thenComparingInt(i -> i))
            .map(repos::get)
            .limit(limit)
            .toList();
        return close.isEmpty() ? repos.stream().limit(limit).toList() : close;
    }

    /**
     * Les dépôts rangés pour la question : ceux qui ressemblent au nom du projet, à sa pile ou à la demande d'abord, les
     * plus ressemblants en tête, puis les autres du plus récemment actif au plus ancien.
     */
    static List<String> ranked(List<String> repos, List<String> hints) {
        List<List<String>> said = hints.stream().filter(hint -> hint != null && !hint.isBlank()).map(RepoMatch::words).toList();
        double[] scores = repos.stream()
            .mapToDouble(repo -> said.stream().mapToDouble(words -> similarity(repo, words)).max().orElse(0))
            .toArray();
        return IntStream.range(0, repos.size()).boxed()
            .sorted(Comparator.comparingDouble((Integer i) -> scores[i] >= CLOSE ? -scores[i] : 0).thenComparingInt(i -> i))
            .map(repos::get)
            .toList();
    }

    /** Le dépôt qui porte ce nom, à l'écriture près (« Atlas Web » et {@code acme/atlas-web}) ; null s'il n'y en a pas un seul. */
    static String named(String projectName, List<String> repos) {
        String wanted = IssueFields.key(projectName);
        if (wanted.isEmpty()) return null;
        List<String> same = repos.stream().filter(repo -> wanted.equals(IssueFields.key(name(repo)))).toList();
        return same.size() == 1 ? same.get(0) : null;
    }

    /** La réponse demande un nouveau dépôt (« un nouveau dépôt privé », « create a new one », « crée-le »). */
    static boolean wantsNew(String said) {
        return plainWords(said).stream().anyMatch(NEW_WORDS::contains);
    }

    /** La visibilité qu'elle dit d'un nouveau dépôt : {@code private}, {@code public}, ou null. */
    static String visibility(String said) {
        List<String> words = plainWords(said);
        if (words.stream().anyMatch(PRIVATE_WORDS::contains)) return "private";
        if (words.stream().anyMatch(PUBLIC_WORDS::contains)) return "public";
        return null;
    }

    /**
     * Combien le dépôt ressemble à ce qui est écrit, de 0 à 1 : le même nom vaut 1 ; un nom qui contient un mot écrit
     * (ou l'inverse), 0,75 au moins ; sinon la part commune des deux, lettre à lettre, sur le meilleur bout de la phrase.
     */
    static double similarity(String repo, List<String> words) {
        String name = IssueFields.key(name(repo));
        if (name.isEmpty() || words.isEmpty()) return 0;
        double best = 0;
        for (int start = 0; start < words.size(); start++) {
            StringBuilder joined = new StringBuilder();
            for (int end = start; end < words.size() && end - start < MAX_WORDS; end++) {
                joined.append(words.get(end));
                String piece = joined.toString();
                if (piece.equals(name)) return 1;
                double ratio = 1 - (double) distance(piece, name) / Math.max(piece.length(), name.length());
                boolean inside = Math.min(piece.length(), name.length()) >= 4 && (name.contains(piece) || piece.contains(name));
                best = Math.max(best, inside ? Math.max(ratio, 0.75) : ratio);
                if (piece.length() > name.length() * 2) break;
            }
        }
        return best;
    }

    /** Le nom d'un dépôt, sans son propriétaire. */
    static String name(String repo) {
        int slash = repo.indexOf('/');
        return slash < 0 ? repo : repo.substring(slash + 1);
    }

    /** Le nom (lu par {@link IssueFields#key}) est dit en mots entiers, à la suite, dans la phrase. */
    private static boolean said(List<String> words, String name) {
        for (int start = 0; start < words.size(); start++) {
            StringBuilder joined = new StringBuilder();
            for (int end = start; end < words.size() && end - start < MAX_WORDS; end++) {
                joined.append(words.get(end));
                if (joined.length() > name.length()) break;
                if (joined.toString().equals(name)) return true;
            }
        }
        return false;
    }

    /**
     * Les mots d'un texte, coupés aux espaces et lus par {@link IssueFields#key} : un nom écrit avec ses tirets reste un
     * mot (« test-tasforce » ne dit pas « test »), écrit avec des espaces il en fait plusieurs, que la lecture recolle.
     */
    static List<String> words(String text) {
        return split(text, "\\s+");
    }

    /** Les mots d'un texte, coupés à tout ce qui n'est ni lettre ni chiffre (« crée-le » dit « crée »). */
    private static List<String> plainWords(String text) {
        return split(text, "[^\\p{L}\\p{N}]+");
    }

    private static List<String> split(String text, String separator) {
        if (text == null) return List.of();
        List<String> out = new ArrayList<>();
        for (String word : text.toLowerCase(Locale.ROOT).split(separator)) {
            String key = IssueFields.key(word);
            if (!key.isEmpty()) out.add(key);
        }
        return out;
    }

    /** La distance d'édition (Levenshtein) entre deux mots courts. */
    private static int distance(String a, String b) {
        int[] previous = new int[b.length() + 1];
        int[] current = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) previous[j] = j;
        for (int i = 1; i <= a.length(); i++) {
            current[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                current[j] = Math.min(Math.min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
            }
            int[] swap = previous;
            previous = current;
            current = swap;
        }
        return previous[b.length()];
    }
}
