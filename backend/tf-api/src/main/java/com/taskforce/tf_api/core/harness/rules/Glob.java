package com.taskforce.tf_api.core.harness.rules;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Motifs des conditions de règles (contracts/README.md) : {@code *} = toute suite de caractères sauf {@code /},
 * {@code **} = toute suite, {@code {a,b}} = une des alternatives (sans imbrication), tout autre caractère = lui-même.
 * Le motif couvre la valeur entière. Même définition que le runner : les cas de contracts/rules/cases.json le prouvent.
 */
public final class Glob {

    private static final Map<String, Pattern> CACHE = new ConcurrentHashMap<>();

    private Glob() {
    }

    public static boolean matches(String pattern, String value) {
        return CACHE.computeIfAbsent(pattern, Glob::compile).matcher(value).matches();
    }

    static Pattern compile(String pattern) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < pattern.length(); i++) {
            char c = pattern.charAt(i);
            if (c == '{') {
                int end = pattern.indexOf('}', i);
                if (end < 0) {
                    out.append(Pattern.quote(String.valueOf(c)));
                    continue;
                }
                String[] alternatives = pattern.substring(i + 1, end).split(",", -1);
                out.append("(?:");
                for (int a = 0; a < alternatives.length; a++) {
                    if (a > 0) {
                        out.append('|');
                    }
                    out.append(translate(alternatives[a]));
                }
                out.append(')');
                i = end;
            } else {
                i = appendStarOrLiteral(pattern, i, out);
            }
        }
        return Pattern.compile(out.toString(), Pattern.DOTALL);
    }

    /** Une alternative, sans accolades. */
    private static String translate(String alternative) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < alternative.length(); i++) {
            i = appendStarOrLiteral(alternative, i, out);
        }
        return out.toString();
    }

    private static int appendStarOrLiteral(String pattern, int i, StringBuilder out) {
        char c = pattern.charAt(i);
        if (c != '*') {
            out.append(Pattern.quote(String.valueOf(c)));
            return i;
        }
        if (i + 1 < pattern.length() && pattern.charAt(i + 1) == '*') {
            out.append(".*");
            return i + 1;
        }
        out.append("[^/]*");
        return i;
    }
}
