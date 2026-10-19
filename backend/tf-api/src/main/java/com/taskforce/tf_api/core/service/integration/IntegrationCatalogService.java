package com.taskforce.tf_api.core.service.integration;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.ConnectorDescriptor;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.CategoryGroup;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.ConnectorView;
import com.taskforce.tf_api.core.enums.ConnectorAuthType;
import com.taskforce.tf_api.core.enums.ConnectorCategory;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService.ConnectedServer;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Assemble le {@link IntegrationCatalogResponse} d'un workspace : le catalogue ({@link ConnectorCatalog}) groupé
 * par catégorie, avec l'état de connexion réel, puis les serveurs MCP ajoutés à la main par le workspace.
 */
@Service
@RequiredArgsConstructor
public class IntegrationCatalogService {

    private final ConnectorCatalog          catalog;
    private final WorkspaceRepository       workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final IntegrationRepository     integrationRepository;
    private final WorkspaceMcpService       workspaceMcp;

    @Transactional(readOnly = true)
    public IntegrationCatalogResponse getCatalog(String slug, Long userId) {
        Workspace ws = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace", "slug", slug));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(ws.getId(), userId)) {
            throw new ForbiddenException("Access denied to this workspace");
        }

        // Une native est connectée par son flux dédié (table `integrations`) ; un préréglage, quand un serveur
        // MCP est enregistré sous sa clé.
        Set<String> connectedKeys = integrationRepository.findByWorkspaceId(ws.getId()).stream()
            .map(i -> i.getProvider().name().toLowerCase())
            .collect(Collectors.toCollection(HashSet::new));
        List<ConnectedServer> servers = workspaceMcp.connectedServers(ws.getId());
        servers.stream().map(ConnectedServer::connectorKey).filter(catalog::isMcpPreset).forEach(connectedKeys::add);

        // Groupement par catégorie, dans l'ordre de déclaration du catalogue.
        Map<String, CategoryGroup> groups = new LinkedHashMap<>();
        int connected = 0;
        List<ConnectorDescriptor> all = catalog.all();
        for (ConnectorDescriptor d : all) {
            boolean isConnected = connectedKeys.contains(d.key());
            if (isConnected) connected++;

            ConnectorView view = new ConnectorView(
                d.key(), d.name(), d.category().name(), d.authType().name(), isConnected, d.fields(),
                d.capabilities(), d.description(), d.docsUrl(), d.setupHint(), d.websiteUrl(), d.mcpSuggestedUrl());

            groups.computeIfAbsent(d.category().name(),
                    k -> new CategoryGroup(d.category().name(), d.category().getLabel(), new ArrayList<>()))
                .tools().add(view);
        }

        // Serveurs hors catalogue : ajoutés à la main (custom-…), ou connexions MCP héritées des tuiles retirées
        // au lot 6, qui restent visibles et déconnectables.
        List<ConnectorView> custom = servers.stream()
            .filter(s -> catalog.byKey(s.connectorKey()).isEmpty())
            .map(IntegrationCatalogService::customView)
            .toList();
        if (!custom.isEmpty()) {
            ConnectorCategory cat = ConnectorCategory.CUSTOM_MCP;
            groups.put(cat.name(), new CategoryGroup(cat.name(), cat.getLabel(), new ArrayList<>(custom)));
        }

        return new IntegrationCatalogResponse(all.size() + custom.size(), connected + custom.size(),
            new ArrayList<>(groups.values()));
    }

    /** Fiche d'un serveur hors catalogue : son nom (sa clé, pour une connexion héritée) et l'hôte de son URL. */
    private static ConnectorView customView(ConnectedServer s) {
        String key = s.connectorKey();
        String name = s.name() != null && !s.name().isBlank() ? s.name()
            : key.startsWith("custom-") ? key.substring("custom-".length()) : key;
        return new ConnectorView(key, name, ConnectorCategory.CUSTOM_MCP.name(), ConnectorAuthType.MCP.name(), true,
            List.of(), List.of("mcp"), host(s.url()), null, null, null, null);
    }

    private static String host(String url) {
        try {
            String host = URI.create(url).getHost();
            return host != null ? host : url;
        } catch (IllegalArgumentException e) {
            return url;
        }
    }
}
