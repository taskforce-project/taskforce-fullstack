package com.taskforce.tf_api.modules.storage.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.service.mcp.CompanyConnections;
import com.taskforce.tf_api.core.service.mcp.McpTokenService;
import com.taskforce.tf_api.modules.storage.domain.StorageKind;
import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Ce qu'il faut au sélecteur de Google (Google Picker) pour s'ouvrir dans la fenêtre de la personne (séance n°22, R154) :
 * la clé du navigateur et le numéro du projet Google de notre application ({@code TF_GOOGLE_API_KEY},
 * {@code TF_GOOGLE_APP_ID}, jamais dans le dépôt), et le jeton d'accès de sa propre connexion, court, pour sa propre
 * fenêtre. Jamais celui d'une connexion partagée : avec {@code drive.file}, ce que la personne choisit est accordé à elle.
 */
@Service
public class GooglePickerService {

    /** La configuration du sélecteur. */
    public record PickerConfig(String developerKey, String appId, String accessToken) {}

    private final CompanyConnections connections;
    private final McpTokenService tokens;
    private final String developerKey;
    private final String appId;

    @Autowired
    public GooglePickerService(CompanyConnections connections, McpTokenService tokens, Environment environment) {
        this(connections, tokens, environment.getProperty("TF_GOOGLE_API_KEY"), environment.getProperty("TF_GOOGLE_APP_ID"));
    }

    GooglePickerService(CompanyConnections connections, McpTokenService tokens, String developerKey, String appId) {
        this.connections = connections;
        this.tokens = tokens;
        this.developerKey = developerKey == null ? "" : developerKey.trim();
        this.appId = appId == null ? "" : appId.trim();
    }

    public PickerConfig config(Long workspaceId, Long userId) {
        if (developerKey.isEmpty() || appId.isEmpty()) {
            throw new BusinessException("Google Drive's picker isn't set up on this instance yet: ask its admin.");
        }
        CompanyConnections.Usable own = connections.own(workspaceId, userId, StorageKind.GOOGLE_DRIVE.connectorKey())
            .orElseThrow(() -> new BusinessException("Connect Google Drive with your own account first: Settings, Integrations."));
        String token = tokens.validAccessToken(own.connection());
        if (token == null) throw new BusinessException("Google Drive no longer accepts the connection: reconnect it.");
        return new PickerConfig(developerKey, appId, token);
    }
}
