package com.taskforce.tf_api.core.service.integration;

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
import com.taskforce.tf_api.core.enums.ConnectorStatus;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Assemble le {@link IntegrationCatalogResponse} d'un workspace : le catalogue déclaratif
 * ({@link ConnectorCatalog}) groupé par catégorie, enrichi de l'état de connexion réel.
 */
@Service
@RequiredArgsConstructor
public class IntegrationCatalogService {

    private final ConnectorCatalog             catalog;
    private final WorkspaceRepository           workspaceRepository;
    private final WorkspaceMemberRepository     workspaceMemberRepository;
    private final IntegrationRepository         integrationRepository;
    private final ConnectorConnectionService    connectorConnectionService;

    @Transactional(readOnly = true)
    public IntegrationCatalogResponse getCatalog(String slug, Long userId) {
        Workspace ws = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace", "slug", slug));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(ws.getId(), userId)) {
            throw new ForbiddenException("Accès refusé au workspace");
        }

        // État de connexion réel = flux dédiés (GitHub/Slack/Plane via `integrations`)
        // + connexions génériques (`connector_connection`).
        Set<String> connectedKeys = new HashSet<>(integrationRepository.findByWorkspaceId(ws.getId()).stream()
            .map(i -> i.getProvider().name().toLowerCase())
            .collect(Collectors.toSet()));
        connectedKeys.addAll(connectorConnectionService.connectedKeys(ws.getId()));

        // Groupement par catégorie, dans l'ordre de déclaration du catalogue.
        Map<String, CategoryGroup> groups = new LinkedHashMap<>();
        int available = 0, connected = 0;
        List<ConnectorDescriptor> all = catalog.all();
        for (ConnectorDescriptor d : all) {
            boolean isConnected = connectedKeys.contains(d.key());
            if (d.status() == ConnectorStatus.AVAILABLE) available++;
            if (isConnected) connected++;

            ConnectorView view = new ConnectorView(
                d.key(), d.name(), d.category().name(), d.authType().name(),
                d.status().name(), isConnected, d.fields(), d.capabilities(), d.description(),
                d.docsUrl(), d.setupHint());

            groups.computeIfAbsent(d.category().name(),
                    k -> new CategoryGroup(d.category().name(), d.category().getLabel(), new ArrayList<>()))
                .tools().add(view);
        }

        return new IntegrationCatalogResponse(all.size(), available, connected, new ArrayList<>(groups.values()));
    }
}
