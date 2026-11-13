package com.taskforce.tf_api.core.service.mcp;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.model.ConnectorApp;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.service.AuditService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * L'application de l'entreprise chez un éditeur (chemin C, séance n°22 R154) : son administrateur la crée dans son
 * tenant, puis saisit une fois ici son identifiant et son secret (chiffré au repos, jamais rendu par l'API). Elle vaut
 * pour tout l'espace : seuls ses propriétaires et administrateurs la voient, la saisissent et la retirent, et le service
 * le vérifie lui-même (règle 3). Chaque saisie et chaque retrait entrent au journal de l'espace, sans le secret.
 */
@Service
@RequiredArgsConstructor
public class ConnectorAppService {

    /** Ce que l'écran sait d'une application d'entreprise : jamais son secret, seulement s'il y en a un. */
    public record CompanyApp(String connectorKey, String clientId, boolean hasSecret) {}

    private static final int MAX_ID = 512;
    private static final int MAX_SECRET = 4096;

    private final ConnectorAppRepository apps;
    private final ConnectorCatalog catalog;
    private final AuthorizationService authorization;
    private final AuditService audit;

    /** Les applications d'entreprise de l'espace, pour un propriétaire ou un administrateur. */
    @Transactional(readOnly = true)
    public List<CompanyApp> list(Long workspaceId, Long userId) {
        authorization.requireForConnection(workspaceId, userId, true);
        return apps.findByWorkspaceId(workspaceId).stream()
            .map(a -> new CompanyApp(a.getConnectorKey(), a.getClientId(),
                a.getClientSecret() != null && !a.getClientSecret().isBlank()))
            .toList();
    }

    /**
     * Enregistre (ou remplace) l'application de l'entreprise pour un outil du catalogue, par un propriétaire ou un
     * administrateur. Un secret vide garde celui déjà saisi : l'écran ne le montre jamais, la personne n'a pas à le
     * retaper pour changer l'identifiant. Un autre identifiant est une autre application : l'émetteur épinglé sur
     * l'ancienne (V130) s'efface, et la prochaine connexion d'un propriétaire ou d'un administrateur qui aboutit par elle
     * l'épingle de nouveau ({@link McpClientRegistrar#pinCompanyIssuer}).
     */
    @Transactional
    public CompanyApp save(Workspace ws, User admin, String connectorKey, String clientId, String clientSecret) {
        authorization.requireForConnection(ws.getId(), admin == null ? null : admin.getId(), true);
        if (!catalog.isMcpPreset(connectorKey)) throw new BusinessException("Unknown tool: " + connectorKey);
        String id = clientId == null ? "" : clientId.strip();
        if (id.isEmpty() || id.length() > MAX_ID) throw new BusinessException("Enter the client ID of your company's app");
        String secret = clientSecret == null ? "" : clientSecret.strip();
        if (secret.length() > MAX_SECRET) throw new BusinessException("This client secret is too long");
        ConnectorApp app = apps.findByWorkspaceIdAndConnectorKey(ws.getId(), connectorKey)
            .orElseGet(() -> ConnectorApp.builder().workspace(ws).connectorKey(connectorKey).build());
        // Un autre identifiant efface l'émetteur épinglé ; le journal ne le dit que s'il y en avait un.
        boolean issuerCleared = app.getIssuer() != null && app.getClientId() != null && !app.getClientId().equals(id);
        if (issuerCleared) app.setIssuer(null);
        app.setClientId(id);
        if (!secret.isEmpty()) app.setClientSecret(secret);
        app.setSavedBy(admin);
        apps.save(app);
        // Au journal de l'espace : l'identifiant, qui n'est pas un secret (RFC 6749, 2.2) ; du secret, seulement s'il a changé.
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("change", "saved");
        details.put("connectorKey", connectorKey);
        details.put("clientId", id);
        details.put("secretChanged", !secret.isEmpty());
        details.put("issuerCleared", issuerCleared);
        audit.record(ws.getId(), admin.getId(), AuditService.COMPANY_APP_CHANGED, "connector_app", connectorKey, details);
        return new CompanyApp(connectorKey, id, app.getClientSecret() != null && !app.getClientSecret().isBlank());
    }

    /** Retire l'application de l'entreprise d'un outil, par un propriétaire ou un administrateur. */
    @Transactional
    public void remove(Long workspaceId, Long userId, String connectorKey) {
        authorization.requireForConnection(workspaceId, userId, true);
        ConnectorApp app = apps.findByWorkspaceIdAndConnectorKey(workspaceId, connectorKey)
            .orElseThrow(() -> new ResourceNotFoundException("No company app for " + connectorKey));
        apps.delete(app);
        audit.record(workspaceId, userId, AuditService.COMPANY_APP_CHANGED, "connector_app", connectorKey,
            Map.of("change", "removed", "connectorKey", connectorKey));
    }
}
