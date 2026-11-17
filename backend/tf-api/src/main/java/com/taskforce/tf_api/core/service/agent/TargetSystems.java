package com.taskforce.tf_api.core.service.agent;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.ConnectorDescriptor;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;

import lombok.RequiredArgsConstructor;

/**
 * Où écrit un outil de Cortex, et quels outils une demande nomme (R204, R201 « demander »).
 *
 * <ul>
 *   <li><b>Un outil</b> écrit dans TaskForce, ou dans l'outil connecté que son nom porte ({@code linear__save_issue}
 *       écrit dans Linear). Le nom est celui du catalogue ; un serveur ajouté à la main se nomme par sa clé.</li>
 *   <li><b>Une demande</b> nomme un outil du catalogue par son nom ou sa clé, en un mot entier, la casse et les accents
 *       ignorés : « crée un projet dans linear » nomme Linear. Un nom qui est aussi un mot courant (Make, Close, Notion,
 *       Zoom...) ne compte qu'après une préposition (« dans Notion », « on Make ») : « make a task » ne nomme rien.</li>
 * </ul>
 *
 * <p>Du code seulement, sans modèle : le 17/11/2026, « crée un projet dans Linear » a créé un projet dans TaskForce, et
 * rien sur la carte ne le disait.</p>
 */
@Component
@RequiredArgsConstructor
public class TargetSystems {

    /** Le système des outils de Cortex qui n'ont pas de préfixe : TaskForce lui-même. */
    public static final String TASKFORCE = "TaskForce";

    /** Les noms que la casse ne suffit pas à dire, pour une clé que le catalogue ne connaît pas. */
    private static final Map<String, String> BRANDS = Map.of("github", "GitHub", "gitlab", "GitLab", "hubspot", "HubSpot",
        "posthog", "PostHog", "clickup", "ClickUp", "paypal", "PayPal");

    /**
     * Les noms d'outils qui sont aussi des mots courants, en anglais ou en français : ils ne comptent qu'après une
     * préposition. « monday » seul est un jour : monday.com se nomme par son nom entier.
     */
    static final Set<String> COMMON_WORDS = Set.of("make", "close", "box", "zoom", "square", "remote", "render", "clay",
        "jam", "lucid", "ramp", "railway", "gong", "mercury", "neon", "hex", "guru", "glean", "framer", "notion", "plane",
        "apollo", "fathom", "granola", "otter", "gusto");

    /** Ce qui précède un outil nommé comme un lieu : « dans Linear », « on Notion », « vers Make ». */
    private static final String PLACE = "(?:dans|sur|vers|via|avec|chez|depuis|de|du|des|d'|in|on|into|to|onto|from|with|"
        + "using|through)\\s+(?:(?:le|la|les|l'|mon|ma|mes|notre|nos|ton|ta|votre|vos|my|our|your|the)\\s*)?";

    private final ConnectorCatalog catalog;

    /** Un outil qu'une demande nomme : son nom, et les clés qui le portent (la native et son second accès, R160). */
    public record Named(String name, Set<String> keys) {
        /** Cet outil est-il le système d'un geste (« Linear ») ou le connecteur d'un outil (« linear ») ? */
        public boolean is(String system) {
            return system != null && (name.equalsIgnoreCase(system) || keys.contains(system.toLowerCase(Locale.ROOT)));
        }
    }

    /** Le connecteur d'un outil externe ({@code linear} pour {@code linear__save_issue}) ; null pour un outil de TaskForce. */
    public static String connectorOf(String tool) {
        int at = tool == null ? -1 : tool.indexOf("__");
        return at > 0 ? tool.substring(0, at) : null;
    }

    /** Le système où cet outil écrit, en mots : « TaskForce », « Linear », « GitHub ». */
    public String of(String tool) {
        String key = connectorOf(tool);
        if (key == null) return TASKFORCE;
        return catalog.byKey(key).map(ConnectorDescriptor::name).orElseGet(() -> plainName(key));
    }

    /**
     * Les outils du catalogue que cette demande nomme, dans l'ordre où elle les nomme ; TaskForce n'en est pas un. Vide
     * pour une demande qui n'en nomme aucun.
     */
    public List<Named> namedIn(String request) {
        if (request == null || request.isBlank()) return List.of();
        String said = plain(request);
        Map<String, Set<String>> keysByName = new LinkedHashMap<>();
        Map<String, Integer> firstAt = new LinkedHashMap<>();
        for (ConnectorDescriptor connector : catalog.all()) {
            for (String alias : aliases(connector)) {
                int at = find(said, alias);
                if (at < 0) continue;
                keysByName.computeIfAbsent(connector.name(), name -> new LinkedHashSet<>()).add(connector.key());
                firstAt.merge(connector.name(), at, Math::min);
            }
        }
        Map<Integer, List<String>> byPosition = new TreeMap<>();
        firstAt.forEach((name, at) -> byPosition.computeIfAbsent(at, position -> new ArrayList<>()).add(name));
        List<Named> named = new ArrayList<>();
        byPosition.values().forEach(names -> names.forEach(name -> named.add(new Named(name, Set.copyOf(keysByName.get(name))))));
        return named;
    }

    /** Les façons de nommer un outil : son nom, sa clé en mots (sans « -mcp »), sans accents ni casse. */
    private static Set<String> aliases(ConnectorDescriptor connector) {
        Set<String> aliases = new LinkedHashSet<>();
        if (connector.name() != null && !connector.name().isBlank()) aliases.add(plain(connector.name()));
        if (connector.key() != null) aliases.add(plain(connector.key().replaceFirst("-mcp$", "").replace('-', ' ')));
        aliases.removeIf(alias -> alias.length() < 3 || "monday".equals(alias));
        return aliases;
    }

    /** Où la demande nomme cet outil, ou -1 ; un mot courant ne compte qu'après une préposition. */
    private static int find(String said, String alias) {
        String word = "(?<![\\p{L}\\p{N}])" + Pattern.quote(alias) + "(?![\\p{L}\\p{N}])";
        Pattern pattern = Pattern.compile(COMMON_WORDS.contains(alias) ? "(?<![\\p{L}\\p{N}])" + PLACE + word : word,
            Pattern.UNICODE_CASE | Pattern.CASE_INSENSITIVE);
        Matcher found = pattern.matcher(said);
        return found.find() ? found.start() : -1;
    }

    /** Un texte sans accents, en minuscules, l'apostrophe typographique ramenée à la droite. */
    static String plain(String text) {
        String bare = Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return bare.replace('’', '\'').toLowerCase(Locale.ROOT);
    }

    /** Le nom d'une clé que le catalogue ne connaît pas : « custom-acme-tools » se dit « Acme Tools ». */
    static String plainName(String key) {
        String bare = key.replaceFirst("^custom-", "").replaceFirst("-mcp$", "");
        return Arrays.stream(bare.split("[-_\\s]+")).filter(word -> !word.isBlank())
            .map(word -> BRANDS.getOrDefault(word.toLowerCase(Locale.ROOT),
                word.substring(0, 1).toUpperCase(Locale.ROOT) + word.substring(1)))
            .collect(Collectors.joining(" "));
    }
}
