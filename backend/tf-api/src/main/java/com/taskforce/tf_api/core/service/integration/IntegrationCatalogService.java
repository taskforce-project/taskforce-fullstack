package com.taskforce.tf_api.core.service.integration;

import java.net.URI;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.ConnectorDescriptor;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.AdminStep;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.CategoryGroup;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.ConnectorView;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.KeyGuide;
import com.taskforce.tf_api.core.enums.ConnectionPath;
import com.taskforce.tf_api.core.enums.ConnectionScope;
import com.taskforce.tf_api.core.enums.ConnectionState;
import com.taskforce.tf_api.core.enums.ConnectorAuthType;
import com.taskforce.tf_api.core.enums.ConnectorCategory;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.mcp.McpOAuthSettings;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService.ConnectedServer;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Assemble le {@link IntegrationCatalogResponse} d'un workspace pour une personne : le catalogue
 * ({@link ConnectorCatalog}) groupé par catégorie, dans l'ordre du registre, avec l'état de la connexion qu'elle
 * utilise (la sienne d'abord, sinon celle que l'espace partage), puis les serveurs MCP ajoutés à la main.
 *
 * <p>Un préréglage jamais essayé n'y figure que pour qui l'a connecté (TF-J1-3, {@link ConnectorCatalog#isShown}).
 * Cortex lit ce même catalogue ({@code find_integration}) : il ne propose pas non plus un outil que l'écran ne montre
 * pas.</p>
 */
@Service
@RequiredArgsConstructor
public class IntegrationCatalogService {

    private final ConnectorCatalog          catalog;
    private final WorkspaceRepository       workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final IntegrationRepository     integrationRepository;
    private final WorkspaceMcpService       workspaceMcp;
    private final ConnectorAppRepository    connectorApps;
    private final McpOAuthSettings          oauthSettings;

    @Transactional(readOnly = true)
    public IntegrationCatalogResponse getCatalog(String slug, Long userId) {
        Workspace ws = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace", "slug", slug));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(ws.getId(), userId)) {
            throw new ForbiddenException("Access denied to this workspace");
        }

        // Une native est connectée par son flux dédié (table `integrations`) ; un préréglage, par la connexion que la
        // personne utilise : la sienne, sinon celle de l'espace.
        Set<String> natives = integrationRepository.findByWorkspaceId(ws.getId()).stream()
            .map(i -> i.getProvider().name().toLowerCase())
            .collect(Collectors.toCollection(HashSet::new));
        List<ConnectedServer> servers = workspaceMcp.connectedServers(ws.getId(), userId);
        Map<String, ConnectedServer> used = new HashMap<>();
        for (ConnectedServer s : servers) {
            ConnectedServer known = used.get(s.connectorKey());
            if (known == null || s.scope() == ConnectionScope.PERSONAL) used.put(s.connectorKey(), s);
        }
        Set<String> companyApps = connectorApps.findByWorkspaceId(ws.getId()).stream()
            .map(a -> a.getConnectorKey()).collect(Collectors.toSet());

        // Groupement par catégorie, dans l'ordre du registre, sans les préréglages jamais essayés que cette personne
        // ne voit pas connectés.
        Map<ConnectorCategory, List<ConnectorView>> groups = new EnumMap<>(ConnectorCategory.class);
        int shown = 0;
        int connected = 0;
        for (ConnectorDescriptor d : catalog.all()) {
            ConnectedServer server = d.preset() == null ? null : used.get(d.key());
            boolean isConnected = d.preset() == null ? natives.contains(d.key())
                : server != null && server.state() == ConnectionState.CONNECTED;
            if (!catalog.isShown(d.key(), isConnected || server != null)) continue;
            shown++;
            if (isConnected) connected++;
            groups.computeIfAbsent(d.category(), k -> new ArrayList<>())
                .add(view(d, isConnected, server, companyApps.contains(d.key())));
        }

        // Serveurs hors catalogue : ajoutés à la main (custom-…), ou connexions MCP héritées des tuiles retirées
        // au lot 6, qui restent visibles et déconnectables.
        List<ConnectorView> custom = used.values().stream()
            .filter(s -> catalog.byKey(s.connectorKey()).isEmpty())
            .sorted(Comparator.comparing(ConnectedServer::connectorKey))
            .map(IntegrationCatalogService::customView)
            .toList();
        if (!custom.isEmpty()) groups.put(ConnectorCategory.CUSTOM_MCP, new ArrayList<>(custom));
        int customConnected = (int) custom.stream().filter(ConnectorView::connected).count();

        List<CategoryGroup> out = new ArrayList<>();
        groups.forEach((cat, tools) -> out.add(new CategoryGroup(cat.name(), cat.getLabel(), tools)));
        return new IntegrationCatalogResponse(shown + custom.size(), connected + customConnected, out);
    }

    /** La fiche d'un outil du catalogue pour cette personne : l'état de sa connexion, et ce qu'il faut pour la faire. */
    private ConnectorView view(ConnectorDescriptor d, boolean connected, ConnectedServer server, boolean companyApp) {
        ConnectorPreset p = d.preset();
        String state = p == null ? (connected ? "CONNECTED" : "NOT_CONNECTED")
            : server == null ? "NOT_CONNECTED" : server.state().name();
        if (p != null && server == null && p.connection() == ConnectionPath.COMPANY_APP && !companyApp) {
            state = ConnectionState.WAITING_FOR_ADMIN.name();
        }
        AdminStep admin = p == null || p.admin() == null ? null
            : new AdminStep(adminText(p.admin().text()), p.admin().link(), p.admin().required());
        KeyGuide key = p == null || p.apiKey() == null ? null : new KeyGuide(p.apiKey().hint(), p.apiKey().link());
        boolean writeChoice = p != null && (p.readUrl() != null || !p.scopesFor(false).equals(p.scopesFor(true)));
        return new ConnectorView(d.key(), d.name(), d.category().name(), d.authType().name(), connected, d.fields(),
            d.capabilities(), d.description(), d.docsUrl(), d.setupHint(), d.websiteUrl(), d.mcpSuggestedUrl(),
            state, server == null ? null : server.accountLabel(), server == null ? null : server.scope().name(),
            p == null ? null : p.connection().wire(), admin, key, companyApp, writeChoice,
            p == null ? null : p.blocked(), p == null || p.isTried());
    }

    private String adminText(String text) {
        return text.replace("{redirectUri}", oauthSettings.redirectUri())
            .replace("{redirectHost}", oauthSettings.redirectHost());
    }

    /** Fiche d'un serveur hors catalogue : son nom (sa clé, pour une connexion héritée) et l'hôte de son URL. */
    private static ConnectorView customView(ConnectedServer s) {
        String key = s.connectorKey();
        String name = s.name() != null && !s.name().isBlank() ? s.name()
            : key.startsWith("custom-") ? key.substring("custom-".length()) : key;
        boolean connected = s.state() == ConnectionState.CONNECTED;
        return new ConnectorView(key, name, ConnectorCategory.CUSTOM_MCP.name(), ConnectorAuthType.MCP.name(), connected,
            List.of(), List.of("mcp"), host(s.url()), null, null, null, null, s.state().name(), s.accountLabel(),
            s.scope().name(), null, null, null, false, false, null, true);
    }

    private static String host(String url) {
        try {
            String host = URI.create(url).getHost();
            return host != null ? host : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
