package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.service.agent.CortexRecordService.Act;

/**
 * Ce que Cortex a fait dans une conversation revient au modèle aux tours suivants (R204, R201 « dire vrai »). Le
 * 17/11/2026, Cortex créait un projet dans TaskForce sur la carte de sa question, puis répondait au tour suivant qu'il
 * n'avait pas créé de projet : d'un tour à l'autre, seuls les textes repartaient au modèle, pas les gestes faits, ni
 * l'accord ou les réponses donnés sur une carte après la réponse.
 *
 * <p>Le dossier de chaque réponse fait foi : TaskForce y lit ses gestes, dans l'ordre, et les ajoute à la réponse telle
 * qu'elle repart au modèle, sous une ligne qui dit que c'est TaskForce qui parle ({@link #HEADER}) : l'outil, où il écrit,
 * ses valeurs utiles, ce qu'il est devenu et ce qu'il a rendu. Jamais à l'écran : la conversation se relit telle que la
 * personne l'a vue. Du code seulement, sans modèle.</p>
 */
public final class ThreadActs {

    /** La ligne qui ouvre ce que TaskForce ajoute à une réponse pour le modèle ; le modèle ne l'écrit jamais lui-même. */
    public static final String HEADER = "[TaskForce record of this reply: what was really done, and where]";
    /** Les gestes d'une réponse qui repartent au plus : les derniers. */
    static final int MAX_ACTS = 8;
    static final int MAX_OUTPUT = 240;
    static final int MAX_VALUES = 200;
    static final int MAX_VALUE = 60;

    /** Ce qui ne dit rien au modèle de ce qui a été fait : les marques de TaskForce, les longs textes. */
    private static final Set<String> SKIPPED = Set.of(Question.ANSWERED, "description", "content", "body", "text");

    private static final ObjectMapper JSON = new ObjectMapper();

    private ThreadActs() {
    }

    /**
     * Les gestes qui comptent, dans l'ordre : une question ou une proposition suivie d'un résultat du même outil
     * s'efface devant lui (la personne a répondu, ou accordé) ; tous les autres restent, un geste défait compris.
     */
    public static List<Act> settled(List<Act> acts) {
        if (acts == null || acts.isEmpty()) return List.of();
        List<Act> kept = new ArrayList<>();
        for (int i = 0; i < acts.size(); i++) {
            Act act = acts.get(i);
            boolean waiting = "pending".equals(act.status()) || AgentService.QUESTION.equals(act.status());
            String tool = act.tool();
            if (waiting && acts.subList(i + 1, acts.size()).stream().anyMatch(later -> later.tool().equals(tool))) continue;
            kept.add(act);
        }
        return kept;
    }

    /**
     * Le bloc que TaskForce ajoute à une réponse, pour le modèle : une ligne par geste, les derniers d'abord coupés à
     * {@link #MAX_ACTS} ; vide sans geste.
     */
    public static String block(List<Act> acts, Function<String, String> where) {
        List<Act> kept = settled(acts);
        if (kept.isEmpty()) return "";
        List<Act> shown = kept.size() <= MAX_ACTS ? kept : kept.subList(kept.size() - MAX_ACTS, kept.size());
        StringBuilder block = new StringBuilder(HEADER);
        for (Act act : shown) block.append("\n- ").append(line(act, where));
        return block.toString();
    }

    /** La réponse telle qu'elle repart au modèle : son texte, puis ce que son dossier dit qu'elle a fait. */
    public static String withActs(String content, List<Act> acts, Function<String, String> where) {
        String block = block(acts, where);
        String said = content == null ? "" : content;
        return block.isEmpty() ? said : said.isBlank() ? block : said.stripTrailing() + "\n\n" + block;
    }

    /**
     * Ce qui a été fait et reste fait : les gestes réussis que la personne n'a pas défaits. Ce qu'une phrase de Cortex
     * ne peut pas nier (R204).
     */
    public static List<ActionClaimCheck.Done> done(List<Act> acts, Function<String, String> where) {
        if (acts == null || acts.isEmpty()) return List.of();
        Set<String> undone = new HashSet<>();
        acts.stream().filter(act -> "undone".equals(act.status()) && act.undoes() != null).forEach(act -> undone.add(act.undoes()));
        List<ActionClaimCheck.Done> done = new ArrayList<>();
        for (Act act : acts) {
            if ("success".equals(act.status()) && (act.hash() == null || !undone.contains(act.hash()))) {
                done.add(new ActionClaimCheck.Done(act.tool(), where.apply(act.tool()), act.output()));
            }
        }
        return done;
    }

    /** Une ligne : « create_project, in TaskForce (name: Test): done. Result: Project created ... ». */
    static String line(Act act, Function<String, String> where) {
        StringBuilder line = new StringBuilder(act.tool()).append(", in ").append(where.apply(act.tool()));
        String values = values(act.arguments());
        if (!values.isEmpty()) line.append(" (").append(values).append(')');
        line.append(": ").append(state(act.status()));
        String output = flat(act.output());
        if (!output.isEmpty() && !AgentService.QUESTION.equals(act.status())) {
            line.append(". Result: ").append(clip(output, MAX_OUTPUT));
        }
        return line.toString();
    }

    /** Ce qu'est devenu un geste, dans les mots que le modèle répète sans se tromper. */
    static String state(String status) {
        return switch (status == null ? "" : status) {
            case "success" -> "done";
            case "pending" -> "proposed on a card, waiting for the person's approval: not done";
            case AgentService.QUESTION -> "TaskForce asked the person first: not done yet";
            case "refused" -> "refused by the rules of this workspace: not done";
            case "error" -> "failed: not done";
            case "undone" -> "undone by the person";
            default -> status;
        };
    }

    /** Les valeurs utiles des arguments : les valeurs simples, sans les textes longs ni les marques de TaskForce. */
    static String values(String arguments) {
        if (arguments == null || arguments.isBlank()) return "";
        JsonNode args;
        try {
            args = JSON.readTree(arguments);
        } catch (Exception unreadable) {
            return "";
        }
        if (args == null || !args.isObject()) return "";
        List<String> said = new ArrayList<>();
        int length = 0;
        for (Iterator<Map.Entry<String, JsonNode>> it = args.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> field = it.next();
            JsonNode value = field.getValue();
            if (SKIPPED.contains(field.getKey()) || value == null || value.isNull() || value.isContainerNode()) continue;
            String text = flat(value.asText());
            if (text.isEmpty()) continue;
            String pair = field.getKey() + ": " + clip(text, MAX_VALUE);
            if (length + pair.length() > MAX_VALUES) break;
            said.add(pair);
            length += pair.length() + 2;
        }
        return String.join(", ", said);
    }

    private static String flat(String text) {
        return text == null ? "" : text.replaceAll("\\s+", " ").strip();
    }

    private static String clip(String text, int max) {
        return text.length() <= max ? text : text.substring(0, max).stripTrailing() + "...";
    }
}
