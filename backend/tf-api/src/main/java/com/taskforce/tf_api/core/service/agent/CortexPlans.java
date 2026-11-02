package com.taskforce.tf_api.core.service.agent;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Les plans des demandes courantes (R117, séance n°17) : supprimer, créer un projet, déplacer ou assigner, « qu'est-ce
 * qui a changé », résumer. Un plan tient sur un écran (ses étapes, ses questions, ses gestes), il est versionné dans
 * {@code resources/cortex/plans}, et des cas de la banque d'évaluations l'essaient.
 *
 * <p><b>Le choix du plan ne revient pas au modèle.</b> Chaque plan déclare dans son fichier les formes de demande qui
 * l'appellent ({@code match}, en anglais et en français) et celles qui l'écartent ({@code unless}) ; TaskForce les lit
 * sur le message avant d'appeler le modèle, et lui donne au plus un plan, celui que le message nomme en premier. Pourquoi
 * ce choix plutôt qu'un modèle ou des embeddings : il ne coûte ni appel ni latence, il marche avec n'importe quel modèle
 * et sans service d'embeddings (R118), il se teste ligne à ligne, et il se trompe à bas prix : un plan manqué laisse la
 * réponse d'avant, un plan de trop ajoute une dizaine de lignes qu'un geste juge encore. Un seul plan : Rus doute qu'un
 * modèle de 8 milliards de paramètres en suive deux.</p>
 */
public final class CortexPlans {

    /** Les plans, dans l'ordre qui départage deux plans nommés au même endroit du message. */
    static final List<String> IDS = List.of("delete", "create-project", "move-assign", "what-changed", "summarize");
    /** Un plan tient sur un écran : la condition de Rus au vote de R117. */
    static final int MAX_LINES = 12;
    static final int MAX_CHARS = 1000;

    private static final int FLAGS = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS;
    private static final String SEPARATOR = "---";

    private static final List<Plan> PLANS = IDS.stream().map(CortexPlans::load).toList();

    private CortexPlans() {}

    /**
     * Un plan : son nom, ce qui l'appelle et ce qui l'écarte dans un message, son texte pour le modèle, et les gestes
     * qu'il nomme (que les tests confrontent à ceux de Cortex).
     */
    public record Plan(String id, Pattern match, Pattern unless, String text, List<String> gestures) {

        /** Où le message nomme ce plan, ou -1 s'il ne l'appelle pas. */
        int position(String message) {
            if (unless != null && unless.matcher(message).find()) return -1;
            Matcher found = match.matcher(message);
            return found.find() ? found.start() : -1;
        }
    }

    public static List<Plan> all() {
        return PLANS;
    }

    /** Le plan de cette demande : celui qu'elle nomme en premier, l'ordre des plans départageant ; aucun sinon. */
    public static Optional<Plan> forRequest(String message) {
        if (message == null || message.isBlank()) return Optional.empty();
        String said = message.replace('’', '\'');
        return PLANS.stream()
            .filter(plan -> plan.position(said) >= 0)
            .min(Comparator.comparingInt((Plan plan) -> plan.position(said)).thenComparingInt(plan -> IDS.indexOf(plan.id())));
    }

    private static Plan load(String id) {
        String path = "/cortex/plans/" + id + ".md";
        try (InputStream in = CortexPlans.class.getResourceAsStream(path)) {
            if (in == null) throw new IllegalStateException("Cortex plan missing: " + path);
            return parse(id, new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException("Cortex plan unreadable: " + path, e);
        }
    }

    /**
     * Un fichier de plan : un en-tête de lignes {@code clé: valeur} ({@code match}, {@code unless}, {@code gestures}),
     * une ligne {@code ---}, puis le texte que lit le modèle.
     */
    static Plan parse(String id, String source) {
        String[] lines = source.replace("\r\n", "\n").split("\n");
        String match = null;
        String unless = null;
        List<String> gestures = new ArrayList<>();
        int body = -1;
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].strip();
            if (SEPARATOR.equals(line)) {
                body = i + 1;
                break;
            }
            if (line.startsWith("match:")) match = line.substring("match:".length()).strip();
            if (line.startsWith("unless:")) unless = line.substring("unless:".length()).strip();
            if (line.startsWith("gestures:")) {
                for (String gesture : line.substring("gestures:".length()).split(",")) {
                    if (!gesture.isBlank()) gestures.add(gesture.strip());
                }
            }
        }
        if (match == null || body < 0) throw new IllegalStateException("Cortex plan " + id + " has no match or no body");
        StringBuilder text = new StringBuilder();
        for (int i = body; i < lines.length; i++) {
            if (!text.isEmpty() || !lines[i].isBlank()) text.append(lines[i].stripTrailing()).append('\n');
        }
        return new Plan(id, Pattern.compile(match, FLAGS), unless == null ? null : Pattern.compile(unless, FLAGS),
            text.toString().strip(), List.copyOf(gestures));
    }
}
