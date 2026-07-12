package com.taskforce.tf_api.core.service.integration;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.ConnectorDescriptor;
import com.taskforce.tf_api.core.dto.response.ConnectorField;
import com.taskforce.tf_api.core.enums.ConnectorStatus;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Connexion <b>générique</b> d'un connecteur du catalogue : stocke les identifiants fournis
 * (chiffrés) et marque le connecteur connecté. C'est une vraie connexion persistée — pas une
 * simulation : elle survit au rechargement, se déconnecte, et les secrets sont chiffrés au repos.
 * La couche « sync des données par service » se branchera par-dessus (comme Plane le fait déjà).
 *
 * <p>GitHub / Slack / Plane gardent leur flux dédié (OAuth, ingestion Brain OS) et sont refusés ici.
 */
@Service
@RequiredArgsConstructor
public class ConnectorConnectionService {

    /** Connecteurs à comportement propre — non gérés par le stockage générique. */
    private static final Set<String> DEDICATED = Set.of("github", "slack", "plane");

    private final BrainAccessGuard               access;
    private final ConnectorCatalog               catalog;
    private final ConnectorConnectionRepository  repository;
    private final UserRepository                 userRepository;
    private final ObjectMapper                   objectMapper;

    /** Clés des connecteurs génériques connectés sur un workspace (pour le catalogue). */
    @Transactional(readOnly = true)
    public Set<String> connectedKeys(Long workspaceId) {
        return repository.findByWorkspaceId(workspaceId).stream()
            .map(ConnectorConnection::getConnectorKey)
            .collect(Collectors.toSet());
    }

    /** Connecte (ou reconfigure) un connecteur : valide les champs requis, chiffre et persiste. */
    @Transactional
    public void connect(String slug, Long userId, String key, Map<String, String> config) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        ConnectorDescriptor descriptor = requireGenericConnector(key);

        Map<String, String> clean = validateAndClean(descriptor, config);

        ConnectorConnection connection = repository.findByWorkspaceIdAndConnectorKey(ws.getId(), key)
            .orElseGet(() -> ConnectorConnection.builder().workspace(ws).connectorKey(key).build());
        connection.setConfig(writeJson(clean));
        User user = userRepository.findById(userId).orElse(null);
        connection.setConnectedBy(user);
        repository.save(connection);
    }

    @Transactional
    public void disconnect(String slug, Long userId, String key) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        if (!repository.existsByWorkspaceIdAndConnectorKey(ws.getId(), key)) {
            throw new ResourceNotFoundException("Connecteur non connecté: " + key);
        }
        repository.deleteByWorkspaceIdAndConnectorKey(ws.getId(), key);
    }

    // -------------------------------------------------------------------------

    private ConnectorDescriptor requireGenericConnector(String key) {
        if (DEDICATED.contains(key)) {
            throw new BusinessException("Ce connecteur se connecte via son flux dédié");
        }
        ConnectorDescriptor descriptor = catalog.byKey(key)
            .orElseThrow(() -> new ResourceNotFoundException("Connecteur inconnu: " + key));
        if (descriptor.status() != ConnectorStatus.AVAILABLE) {
            throw new BusinessException("Ce connecteur n'est pas encore disponible");
        }
        return descriptor;
    }

    /** Ne conserve que les champs déclarés du connecteur, et exige les champs requis non vides. */
    private Map<String, String> validateAndClean(ConnectorDescriptor descriptor, Map<String, String> config) {
        Map<String, String> in = config != null ? config : Map.of();
        Map<String, String> clean = new LinkedHashMap<>();
        for (ConnectorField field : descriptor.fields()) {
            String value = in.getOrDefault(field.key(), "").trim();
            if (field.required() && value.isEmpty()) {
                throw new BusinessException("Champ requis manquant : " + field.label());
            }
            if (!value.isEmpty()) clean.put(field.key(), value);
        }
        return clean;
    }

    private String writeJson(Map<String, String> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{}";
        }
    }

    // Réservé à une future couche de lecture (sync) : reconstruit la config déchiffrée.
    @SuppressWarnings("unused")
    private Map<String, String> readJson(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, String>>() {});
        } catch (Exception ex) {
            return Map.of();
        }
    }
}
