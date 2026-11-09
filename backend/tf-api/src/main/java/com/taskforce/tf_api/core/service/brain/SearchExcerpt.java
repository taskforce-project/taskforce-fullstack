package com.taskforce.tf_api.core.service.brain;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Le passage d'un texte qui répond à une recherche, en texte brut (Ctrl+K, R141) : une ligne de résultat montre les mots
 * autour de ce qu'on a tapé, sans la mise en forme Markdown. Util sans état, partagé par les notes et les commentaires.
 */
public final class SearchExcerpt {

    /** La longueur d'un passage, sans ses points de suspension. */
    public static final int LENGTH = 120;
    /** Ce qu'on garde avant le mot trouvé, pour qu'il se lise dans sa phrase. */
    private static final int LEAD = 30;

    private static final Pattern IMAGE = Pattern.compile("!\\[[^\\]]*\\]\\([^)]*\\)");
    private static final Pattern LINK = Pattern.compile("\\[([^\\]]*)\\]\\([^)]*\\)");
    private static final Pattern WIKILINK = Pattern.compile("\\[\\[([^\\]|]+)(?:\\|[^\\]]*)?\\]\\]");
    private static final Pattern MARKS = Pattern.compile("[`*_~>#]+");
    private static final Pattern SPACES = Pattern.compile("\\s+");

    private SearchExcerpt() {}

    /** Le texte sans sa mise en forme, sur une ligne. */
    static String plain(String content) {
        if (content == null) return "";
        String text = IMAGE.matcher(content).replaceAll(" ");
        text = WIKILINK.matcher(text).replaceAll("$1");
        text = LINK.matcher(text).replaceAll("$1");
        text = MARKS.matcher(text).replaceAll(" ");
        return SPACES.matcher(text).replaceAll(" ").strip();
    }

    /**
     * Le passage autour du premier mot trouvé ({@code terms} en minuscules), coupé à un mot, avec des points de suspension
     * là où le texte continue ; le début du texte quand aucun mot n'y est (une note trouvée par son titre).
     */
    public static String around(String content, List<String> terms) {
        String text = plain(content);
        if (text.length() <= LENGTH) return text;
        String lower = text.toLowerCase(Locale.ROOT);
        int at = terms.stream().mapToInt(lower::indexOf).filter(index -> index >= 0).min().orElse(0);
        int from = Math.max(0, at - LEAD);
        if (from > 0) {
            int space = text.indexOf(' ', from);
            if (space >= 0 && space < at) from = space + 1;
        }
        int to = Math.min(text.length(), from + LENGTH);
        if (to < text.length()) {
            int space = text.lastIndexOf(' ', to);
            if (space > Math.max(from, at)) to = space;
        }
        return (from > 0 ? "…" : "") + text.substring(from, to).strip() + (to < text.length() ? "…" : "");
    }
}
