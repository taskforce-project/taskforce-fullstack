package com.taskforce.tf_api.core.service.mcp;

import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.ConnectionState;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Les connexions aux outils servis par l'API de leur éditeur (Google Drive, Microsoft 365) : la connexion qu'une
 * personne utilise, la sienne sinon celle que l'espace partage, jamais celle d'une autre (séance n°22, R154) ; puis un
 * appel avec son jeton, renouvelé une fois sur un refus. Des jetons délégués seulement : les droits de la source suivent
 * la personne (R155), aucun compte de service.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CompanyConnections {

    static final String RECONNECT = "This tool no longer accepts the connection: reconnect it in Settings, Integrations.";

    private final ConnectorConnectionRepository repository;
    private final McpTokenService tokens;
    private final ObjectMapper objectMapper;

    /** Une connexion branchée : l'adresse de l'API, si elle est partagée avec l'espace, et les portées accordées. */
    public record Usable(ConnectorConnection connection, String base, boolean shared, Set<String> granted) {

        /** L'éditeur a-t-il accordé cette portée ? (sans casse : Microsoft rend {@code Files.ReadWrite.All}) */
        public boolean grants(String scope) {
            return granted.contains(scope.toLowerCase(Locale.ROOT));
        }
    }

    /** La connexion que la personne utilise pour cet outil, branchée ; vide sinon. */
    @Transactional(readOnly = true)
    public Optional<Usable> usable(Long workspaceId, Long userId, String connectorKey) {
        Optional<ConnectorConnection> own = userId == null ? Optional.empty()
            : repository.findByWorkspaceIdAndConnectorKeyAndOwnerId(workspaceId, connectorKey, userId);
        return own.or(() -> repository.findByWorkspaceIdAndConnectorKeyAndOwnerIsNull(workspaceId, connectorKey))
            .filter(c -> c.getState() == ConnectionState.CONNECTED)
            .map(this::of);
    }

    /** La connexion de la personne elle-même, branchée ; vide sinon (le sélecteur de Google accorde à une personne). */
    @Transactional(readOnly = true)
    public Optional<Usable> own(Long workspaceId, Long userId, String connectorKey) {
        return repository.findByWorkspaceIdAndConnectorKeyAndOwnerId(workspaceId, connectorKey, userId)
            .filter(c -> c.getState() == ConnectionState.CONNECTED)
            .map(this::of);
    }

    /** La même connexion, relue : un outil gardé en cache depuis une minute appelle avec l'état du moment. */
    @Transactional(readOnly = true)
    public Optional<Usable> reload(Long connectionId) {
        return repository.findById(connectionId).filter(c -> c.getState() == ConnectionState.CONNECTED).map(this::of);
    }

    public Usable of(ConnectorConnection conn) {
        Map<String, String> config = read(conn.getConfig());
        String granted = config.getOrDefault(McpTokenService.K_GRANTED, "");
        Set<String> scopes = Arrays.stream(granted.split("\\s+")).filter(s -> !s.isBlank())
            .map(s -> s.toLowerCase(Locale.ROOT)).collect(Collectors.toUnmodifiableSet());
        return new Usable(conn, trim(config.getOrDefault(WorkspaceMcpService.CONFIG_URL, "")), conn.isShared(), scopes);
    }

    /**
     * Un appel avec le jeton de la connexion. Un refus le renouvelle une fois et refait l'appel ; un second refus, ou un
     * renouvellement impossible, passe la connexion à « Needs reconnecting », et la personne lit quoi faire.
     */
    public <T> T call(Usable usable, Function<String, T> call) {
        ConnectorConnection conn = usable.connection();
        String token = tokens.validAccessToken(conn);
        if (token == null) throw new BusinessException(RECONNECT);
        try {
            return call.apply(token);
        } catch (CompanyApiHttp.Unauthorized first) {
            String renewed = tokens.refreshNow(conn);
            if (renewed == null) throw new BusinessException(RECONNECT);
            try {
                return call.apply(renewed);
            } catch (CompanyApiHttp.Unauthorized again) {
                needsReconnect(conn);
                throw new BusinessException(RECONNECT);
            }
        }
    }

    private void needsReconnect(ConnectorConnection conn) {
        try {
            conn.setState(ConnectionState.NEEDS_RECONNECT);
            repository.save(conn);
        } catch (RuntimeException e) {
            log.debug("Etat de la connexion '{}' non garde : {}", LogSafe.of(conn.getConnectorKey()), LogSafe.of(e.getMessage()));
        }
    }

    private Map<String, String> read(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, String>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    private static String trim(String url) {
        String v = url == null ? "" : url.trim();
        while (v.endsWith("/")) v = v.substring(0, v.length() - 1);
        return v;
    }
}
