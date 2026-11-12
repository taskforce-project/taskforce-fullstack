package com.taskforce.tf_api.core.service.mcp;

import java.net.URI;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Les adresses du flux OAuth des serveurs MCP, pour le serveur et pour l'app desktop (séance n°22, R154 ; RFC 8252).
 *
 * <ul>
 *   <li><b>Serveur</b> : le navigateur revient sur {@code <redirect-base>/api/mcp/oauth/callback}, puis sur l'app
 *       ({@code app-base}). Notre document de métadonnées client (CIMD) est servi à
 *       {@code <redirect-base>/api/mcp/oauth/client.json}, seulement quand cette base est en HTTPS (un serveur
 *       d'autorisation doit pouvoir le lire).</li>
 *   <li><b>App desktop</b> (profil {@code desktop}) : le navigateur du système revient sur 127.0.0.1, sur un port fixe
 *       de la coque ({@code redirect-uri}, cf. {@code desktop/src/mcp-callback.ts}), qui remet le code au backend
 *       local ; le jeton ne quitte jamais la machine. Le CIMD est celui que publie le serveur hébergé pour l'app
 *       desktop ({@code cimd-url}), qui liste les quatre adresses de retour fixes.</li>
 * </ul>
 */
@Component
public class McpOAuthSettings {

    /** Chemin du retour sur le serveur. */
    public static final String CALLBACK_PATH = "/api/mcp/oauth/callback";
    /** Document de métadonnées client du serveur, et celui de l'app desktop, servis par le serveur hébergé. */
    public static final String CIMD_PATH = "/api/mcp/oauth/client.json";
    public static final String DESKTOP_CIMD_PATH = "/api/mcp/oauth/desktop-client.json";
    /** Les ports de retour de l'app desktop, essayés dans l'ordre par la coque (comme la connexion au compte). */
    public static final List<Integer> DESKTOP_CALLBACK_PORTS = List.of(47816, 47817, 47818, 47819);
    /** Le chemin du retour sur la coque de l'app desktop. */
    public static final String DESKTOP_CALLBACK_PATH = "/mcp/callback";

    private final String redirectBase;
    private final String redirectUri;
    private final String appBase;
    private final String clientName;
    private final String applicationType;
    private final String cimdUrl;

    public McpOAuthSettings(
        @Value("${integrations.mcp.oauth.redirect-base:http://localhost:8080}") String redirectBase,
        @Value("${integrations.mcp.oauth.redirect-uri:}") String redirectUri,
        @Value("${integrations.mcp.oauth.app-base:http://localhost:3000}") String appBase,
        @Value("${integrations.mcp.oauth.client-name:TaskForce}") String clientName,
        @Value("${integrations.mcp.oauth.application-type:web}") String applicationType,
        @Value("${integrations.mcp.oauth.cimd-url:}") String cimdUrl) {
        this.redirectBase = trim(redirectBase);
        this.redirectUri = redirectUri == null || redirectUri.isBlank()
            ? this.redirectBase + CALLBACK_PATH : redirectUri.trim();
        this.appBase = trim(appBase);
        this.clientName = clientName == null || clientName.isBlank() ? "TaskForce" : clientName.trim();
        this.applicationType = "native".equalsIgnoreCase(applicationType) ? "native" : "web";
        this.cimdUrl = cimdUrl == null || cimdUrl.isBlank()
            ? (this.redirectBase.startsWith("https://") ? this.redirectBase + CIMD_PATH : null)
            : cimdUrl.trim();
    }

    /** L'adresse de retour inscrite chez l'éditeur. */
    public String redirectUri() {
        return redirectUri;
    }

    /** L'hôte de l'adresse de retour, avec son schéma (pour la phrase de l'administrateur). */
    public String redirectHost() {
        URI u = URI.create(redirectUri);
        String port = u.getPort() > 0 ? ":" + u.getPort() : "";
        return u.getScheme() + "://" + u.getHost() + port;
    }

    /** L'interface, où le navigateur revient après le retour sur le serveur. */
    public String appBase() {
        return appBase;
    }

    public String clientName() {
        return clientName;
    }

    /** {@code native} pour l'app desktop, {@code web} pour le serveur (champ {@code application_type} de DCR). */
    public String applicationType() {
        return applicationType;
    }

    /** L'app desktop : le retour se fait sur la boucle locale. */
    public boolean desktop() {
        return "native".equals(applicationType);
    }

    /** L'adresse de notre document de métadonnées client (CIMD) ; nulle quand il n'y en a pas (pas de HTTPS). */
    public String cimdUrl() {
        return cimdUrl;
    }

    /** Ce que le serveur publie comme document du serveur : son adresse est l'identifiant du client. */
    public String serverCimdUrl() {
        return redirectBase + CIMD_PATH;
    }

    /** Le document de l'app desktop, publié par le serveur hébergé. */
    public String desktopCimdUrl() {
        return redirectBase + DESKTOP_CIMD_PATH;
    }

    /** Les adresses de retour de l'app desktop, toutes listées dans son document de métadonnées. */
    public static List<String> desktopRedirectUris() {
        return DESKTOP_CALLBACK_PORTS.stream()
            .map(port -> "http://127.0.0.1:" + port + DESKTOP_CALLBACK_PATH).toList();
    }

    private static String trim(String url) {
        String v = url == null ? "" : url.trim();
        while (v.endsWith("/")) v = v.substring(0, v.length() - 1);
        return v;
    }
}
