package com.taskforce.tf_api.core.service.agent.tools;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.CategoryGroup;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.ConnectorView;
import com.taskforce.tf_api.core.service.integration.IntegrationCatalogService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;

import lombok.RequiredArgsConstructor;

/**
 * Outil interne (TF-MCP-03, Pilier 3) : cherche une intégration dans le catalogue TaskForce par nom
 * ou mot-clé, et dit si elle est <b>déjà connectée</b>, <b>disponible mais à connecter</b>, ou
 * <b>absente</b>. Permet à l'agent de <b>guider vers la connexion</b> (« connecte X ») au lieu de
 * prétendre l'absence d'accès ou d'inventer. Un outil absent du catalogue se branche encore par son
 * propre serveur MCP (ADR-020) : la réponse le dit.
 */
@Component
@RequiredArgsConstructor
public class FindIntegrationTool implements AgentTool {

    private static final int MAX_HITS = 8;

    private final IntegrationCatalogService catalogService;

    @Override public String name() { return "find_integration"; }

    @Override public String description() {
        return "Looks up an integration in the TaskForce catalog (by name or keyword: \"stripe\", "
            + "\"payments\", \"github\"...). Says whether it is already connected, available (to connect), or "
            + "missing. Use it BEFORE saying you have no access to a system: the user may only need to "
            + "connect it.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of(
            "type", "object",
            "properties", Map.of(
                "query", Map.of("type", "string", "description", "Name or keyword of the service")
            ),
            "required", List.of("query")
        );
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        String query = args.get("query") != null ? String.valueOf(args.get("query")).trim().toLowerCase() : "";
        if (query.isEmpty()) return "Name the service you are looking for (e.g. \"stripe\", \"payments\").";

        IntegrationCatalogResponse catalog = catalogService.getCatalog(ctx.slug(), ctx.userId());
        List<String> hits = new ArrayList<>();
        for (CategoryGroup group : catalog.categories()) {
            for (ConnectorView c : group.tools()) {
                if (matches(c, group, query)) {
                    hits.add("- " + c.name() + " (" + group.label() + ") : "
                        + (c.connected() ? "already connected" : "available, NOT connected"));
                    if (hits.size() >= MAX_HITS) break;
                }
            }
            if (hits.size() >= MAX_HITS) break;
        }

        if (hits.isEmpty()) {
            return "No integration matches \"" + query + "\" in the TaskForce catalog. "
                + "Tell the user plainly, and add that any tool with an MCP server can still be connected: "
                + "Settings > Integrations > Connect an MCP server.";
        }
        StringBuilder sb = new StringBuilder("Integrations matching \"" + query + "\":");
        for (String h : hits) sb.append("\n").append(h);
        sb.append("\nTo connect one: Settings > Integrations.");
        return sb.toString();
    }

    private static boolean matches(ConnectorView c, CategoryGroup group, String query) {
        if (contains(c.name(), query) || contains(c.key(), query)
            || contains(c.category(), query) || contains(group.label(), query)) {
            return true;
        }
        if (c.capabilities() != null) {
            for (String cap : c.capabilities()) if (contains(cap, query)) return true;
        }
        return false;
    }

    private static boolean contains(String s, String q) {
        return s != null && s.toLowerCase().contains(q);
    }
}
