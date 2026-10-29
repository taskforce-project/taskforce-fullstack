package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Note un rejeu contre les critères d'un cas : du code seulement, la même note pour les mêmes
 * sorties. Le cas passe si chaque critère passe.
 */
public final class EvalGrader {

    private static final ObjectMapper JSON = new ObjectMapper();

    private EvalGrader() {
    }

    /** Un critère noté : ce qu'il demandait, s'il passe, ce qui a été vu. */
    public record Check(String criterion, boolean passed, String detail) {
    }

    public record Grade(boolean passed, List<Check> checks) {
    }

    public static Grade grade(EvalCriteria criteria, ReplayOutcome outcome) {
        List<Check> checks = new ArrayList<>();
        List<ReplayOutcome.ReplayCall> calls = outcome.calls();
        String answer = outcome.answer() == null ? "" : outcome.answer();
        String called = calls.isEmpty() ? "no tool" : calls.stream().map(ReplayOutcome.ReplayCall::tool)
            .collect(Collectors.joining(", "));

        if (EvalCriteria.NO_TOOL.equals(criteria.tool())) {
            checks.add(new Check("no tool", calls.isEmpty(), "called: " + called));
        } else if (!criteria.tool().isEmpty()) {
            List<ReplayOutcome.ReplayCall> sameTool = calls.stream().filter(c -> c.tool().equals(criteria.tool())).toList();
            checks.add(new Check("calls " + criteria.tool(), !sameTool.isEmpty(), "called: " + called));
            if (!sameTool.isEmpty() && !criteria.args().isEmpty()) {
                boolean match = sameTool.stream().anyMatch(c -> argsMatch(criteria.args(), c.arguments()));
                checks.add(new Check("with " + describe(criteria.args()), match, "arguments: "
                    + sameTool.stream().map(ReplayOutcome.ReplayCall::arguments).collect(Collectors.joining(" | "))));
            }
            if (!sameTool.isEmpty() && !criteria.effect().isEmpty()) {
                boolean match = sameTool.stream().anyMatch(c -> criteria.effect().equals(c.effect()));
                checks.add(new Check("rule effect " + criteria.effect(), match, "effects: "
                    + sameTool.stream().map(ReplayOutcome.ReplayCall::effect).collect(Collectors.joining(", "))));
            }
        }
        for (String forbidden : criteria.forbid()) {
            boolean absent = calls.stream().noneMatch(c -> c.tool().equals(forbidden));
            checks.add(new Check("does not call " + forbidden, absent, "called: " + called));
        }
        String lower = answer.toLowerCase(Locale.ROOT);
        for (String word : criteria.contains()) {
            checks.add(new Check("says \"" + word + "\"", lower.contains(word.toLowerCase(Locale.ROOT)), excerpt(answer)));
        }
        for (String word : criteria.notContains()) {
            checks.add(new Check("does not say \"" + word + "\"", !lower.contains(word.toLowerCase(Locale.ROOT)),
                excerpt(answer)));
        }
        boolean passed = !checks.isEmpty() && checks.stream().allMatch(Check::passed);
        return new Grade(passed, List.copyOf(checks));
    }

    /** Chaque argument attendu a l'une de ses valeurs acceptées, casse et espaces de bord ignorés. */
    static boolean argsMatch(Map<String, List<String>> expected, String argsJson) {
        JsonNode args;
        try {
            args = JSON.readTree(argsJson == null || argsJson.isBlank() ? "{}" : argsJson);
        } catch (Exception unreadable) {
            return false;
        }
        for (Map.Entry<String, List<String>> entry : expected.entrySet()) {
            JsonNode value = args.path(entry.getKey());
            if (value.isMissingNode() || value.isNull()) return false;
            String actual = (value.isValueNode() ? value.asText() : value.toString()).strip();
            boolean accepted = entry.getValue().stream().anyMatch(v -> v.strip().equalsIgnoreCase(actual));
            if (!accepted) return false;
        }
        return true;
    }

    private static String describe(Map<String, List<String>> args) {
        return args.entrySet().stream()
            .map(e -> e.getKey() + " = " + String.join(" or ", e.getValue()))
            .collect(Collectors.joining(", "));
    }

    private static String excerpt(String answer) {
        String flat = answer.replace('\n', ' ').strip();
        return flat.length() <= 200 ? flat : flat.substring(0, 200) + "...";
    }
}
