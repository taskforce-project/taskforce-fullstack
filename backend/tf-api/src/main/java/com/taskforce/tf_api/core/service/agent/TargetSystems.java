package com.taskforce.tf_api.core.service.agent;

import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.ConnectorDescriptor;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;

import lombok.RequiredArgsConstructor;

/**
 * Où écrit un outil de Cortex (R204, R201 « demander ») : dans TaskForce, ou dans l'outil connecté que son nom porte
 * ({@code linear__save_issue} écrit dans Linear). Le nom est celui du catalogue ; un serveur ajouté à la main se nomme
 * par sa clé, sans {@code custom-}.
 */
@Component
@RequiredArgsConstructor
public class TargetSystems {

    /** Le système des outils de Cortex qui n'ont pas de préfixe : TaskForce lui-même. */
    public static final String TASKFORCE = "TaskForce";

    /** Les noms que la casse ne suffit pas à dire, pour une clé que le catalogue ne connaît pas. */
    private static final Map<String, String> BRANDS = Map.of("github", "GitHub", "gitlab", "GitLab", "hubspot", "HubSpot",
        "posthog", "PostHog", "clickup", "ClickUp", "paypal", "PayPal");

    private final ConnectorCatalog catalog;

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

    /** Le nom d'une clé que le catalogue ne connaît pas : « custom-acme-tools » se dit « Acme Tools ». */
    static String plainName(String key) {
        String bare = key.replaceFirst("^custom-", "").replaceFirst("-mcp$", "");
        return Arrays.stream(bare.split("[-_\\s]+")).filter(word -> !word.isBlank())
            .map(word -> BRANDS.getOrDefault(word.toLowerCase(Locale.ROOT),
                word.substring(0, 1).toUpperCase(Locale.ROOT) + word.substring(1)))
            .collect(Collectors.joining(" "));
    }
}
