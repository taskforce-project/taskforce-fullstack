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
 * prétendre l'absence d'accès ou d'inventer. Générique : piloté par le catalogue, aucun service en dur.
 */
@Component
@RequiredArgsConstructor
public class FindIntegrationTool implements AgentTool {

    private static final int MAX_HITS = 8;

    private final IntegrationCatalogService catalogService;

    @Override public String name() { return "find_integration"; }

    @Override public String description() {
        return "Cherche une intégration dans le catalogue TaskForce (par nom ou mot-clé : « stripe », "
            + "« paiement », « github »…). Dit si elle est déjà connectée, disponible (à connecter), ou "
            + "absente. À utiliser AVANT d'affirmer que tu n'as pas accès à un système : il suffit peut-être "
            + "que l'utilisateur le connecte.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of(
            "type", "object",
            "properties", Map.of(
                "query", Map.of("type", "string", "description", "Nom ou mot-clé du service recherché")
            ),
            "required", List.of("query")
        );
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        String query = args.get("query") != null ? String.valueOf(args.get("query")).trim().toLowerCase() : "";
        if (query.isEmpty()) return "Précise le service recherché (ex. « stripe », « paiement »).";

        IntegrationCatalogResponse catalog = catalogService.getCatalog(ctx.slug(), ctx.userId());
        List<String> hits = new ArrayList<>();
        for (CategoryGroup group : catalog.categories()) {
            for (ConnectorView c : group.tools()) {
                if (matches(c, group, query)) {
                    hits.add("- " + c.name() + " (" + group.label() + ") : "
                        + (c.connected() ? "déjà connecté" : "disponible, NON connecté"));
                    if (hits.size() >= MAX_HITS) break;
                }
            }
            if (hits.size() >= MAX_HITS) break;
        }

        if (hits.isEmpty()) {
            return "Aucune intégration ne correspond à « " + query + " » dans le catalogue TaskForce. "
                + "Dis-le franchement à l'utilisateur : pas d'intégration pour ça pour l'instant.";
        }
        StringBuilder sb = new StringBuilder("Intégrations correspondant à « " + query + " » :");
        for (String h : hits) sb.append("\n").append(h);
        sb.append("\nPour en connecter une : Réglages > Intégrations.");
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
