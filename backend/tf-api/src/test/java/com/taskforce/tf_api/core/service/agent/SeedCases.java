package com.taskforce.tf_api.core.service.agent;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import com.taskforce.tf_api.core.model.EvalCase;

/**
 * Les cas de la banque que la recette de la 1.17.0 a donnés (R204), tels que le seed de dev les écrit
 * ({@code seed/dev_seed.sql}, entre ses deux marques) : les tests les relisent et les rejouent, pour qu'un cas de la banque
 * soit celui que le code sait rejouer, et non une copie qui s'en écarte.
 */
final class SeedCases {

    static final Path SEED = Path.of("seed", "dev_seed.sql");
    static final String BEGIN = "-- R204 bank cases: begin";
    static final String END = "-- R204 bank cases: end";
    static final LocalDate ASKED_ON = LocalDate.of(2026, 11, 17);

    private SeedCases() {
    }

    /** Un cas du seed : son numéro, son titre, sa question, sa cassette, ses critères et ce qui l'entoure, en JSON. */
    record Row(int n, String title, String question, String cassette, String criteria, String context) {
        EvalCase evalCase() {
            return EvalCase.builder().id((long) n).workspaceId(1L).title(title).question(question).askedOn(ASKED_ON)
                .notes("[]").cassette(cassette).criteria(criteria).context(context).build();
        }
    }

    static List<Row> r204() {
        String seed;
        try {
            seed = Files.readString(SEED, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("The dev seed is not readable: " + SEED.toAbsolutePath(), e);
        }
        int begin = seed.indexOf(BEGIN);
        int end = seed.indexOf(END);
        if (begin < 0 || end < begin) throw new IllegalStateException("The R204 cases are not between their marks");
        String block = seed.substring(begin, end);
        // Les outils de Linear, figés une fois dans la CTE « linear » : le seed les met à la place de "external":"linear".
        String linear = null;
        int cte = block.indexOf(LINEAR);
        if (cte >= 0) linear = literal(block, block.indexOf('\'', cte + LINEAR.length()));
        int values = block.indexOf("(VALUES", Math.max(0, block.indexOf("CROSS JOIN")));
        List<Row> rows = rows(block.substring(values + "(VALUES".length()));
        if (linear == null) return rows;
        String tools = linear;
        return rows.stream().map(row -> new Row(row.n(), row.title(), row.question(), row.cassette(), row.criteria(),
            row.context().replace("\"external\":\"linear\"", "\"external\":" + tools))).toList();
    }

    static final String LINEAR = "WITH linear(tools) AS (VALUES (";

    /** La chaîne SQL qui commence à {@code at} (son apostrophe), ses '' rendues en '. */
    private static String literal(String sql, int at) {
        StringBuilder text = new StringBuilder();
        for (int i = at + 1; i < sql.length(); i++) {
            char c = sql.charAt(i);
            if (c == '\'' && i + 1 < sql.length() && sql.charAt(i + 1) == '\'') {
                text.append('\'');
                i++;
            } else if (c == '\'') {
                return text.toString();
            } else {
                text.append(c);
            }
        }
        throw new IllegalStateException("An SQL string that never ends");
    }

    /** Les lignes {@code (n, 'texte', ...)} d'un VALUES : des nombres et des chaînes SQL, leurs '' rendues en '. */
    private static List<Row> rows(String sql) {
        List<Row> rows = new ArrayList<>();
        List<String> fields = new ArrayList<>();
        int depth = 0;
        for (int i = 0; i < sql.length(); i++) {
            char c = sql.charAt(i);
            if (c == '\'') {
                StringBuilder text = new StringBuilder();
                for (i++; i < sql.length(); i++) {
                    char d = sql.charAt(i);
                    if (d == '\'' && i + 1 < sql.length() && sql.charAt(i + 1) == '\'') {
                        text.append('\'');
                        i++;
                    } else if (d == '\'') {
                        break;
                    } else {
                        text.append(d);
                    }
                }
                fields.add(text.toString());
            } else if (c == '(') {
                depth++;
                fields.clear();
            } else if (c == ')') {
                if (depth == 1 && fields.size() == 6) {
                    rows.add(new Row(Integer.parseInt(fields.get(0)), fields.get(1), fields.get(2), fields.get(3), fields.get(4),
                        fields.get(5)));
                }
                depth--;
                if (depth < 0) break;
            } else if (Character.isDigit(c) && depth == 1 && fields.isEmpty()) {
                int start = i;
                while (i + 1 < sql.length() && Character.isDigit(sql.charAt(i + 1))) i++;
                fields.add(sql.substring(start, i + 1));
            }
        }
        return rows;
    }
}
