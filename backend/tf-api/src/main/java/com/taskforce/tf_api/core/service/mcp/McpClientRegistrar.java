package com.taskforce.tf_api.core.service.mcp;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.taskforce.tf_api.core.model.ConnectorApp;
import com.taskforce.tf_api.core.model.McpOAuthRegistration;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.repository.McpOAuthRegistrationRepository;
import com.taskforce.tf_api.core.service.mcp.McpOAuthDiscovery.DiscoveredAuth;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Le client OAuth que TaskForce présente à un serveur d'autorisation, dans l'ordre de la norme MCP du 28/07/2026
 * (inscription du client) et de la séance n°22 (R154) :
 *
 * <ol>
 *   <li><b>un client enregistré d'avance</b>, chez l'émetteur que le préréglage épingle seulement : celui de
 *       l'entreprise, quand son administrateur l'a saisi pour cet espace (chemin C, le plus précis), sinon le nôtre, lu
 *       dans les variables d'environnement {@code TF_MCP_<CLÉ>_CLIENT_ID} et {@code TF_MCP_<CLÉ>_CLIENT_SECRET}
 *       (chemin B ; jamais dans le dépôt) ;</li>
 *   <li><b>notre document de métadonnées</b> (CIMD) : son adresse HTTPS sert d'identifiant, quand le serveur
 *       l'annonce et que le document répond ;</li>
 *   <li><b>l'inscription dynamique</b> (DCR), dépréciée par la norme mais encore la plus répandue : une seule par
 *       émetteur et adresse de retour, gardée en base, avec {@code application_type} ;</li>
 *   <li>sinon {@link NoClient} : l'appelant dit à la personne l'étape de l'administrateur, ou la clé guidée.</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class McpClientRegistrar {

    /** D'où vient le client présenté au serveur. */
    public static final String COMPANY = "company";
    public static final String OURS = "ours";
    public static final String CIMD = "cimd";
    public static final String DCR = "dcr";

    /** Le client choisi : son identifiant, son secret (nul pour un client public) et sa provenance. */
    public record RegisteredClient(String clientId, String clientSecret, String source) {}

    /** Aucun chemin d'inscription : ni client enregistré, ni CIMD, ni DCR. */
    public static class NoClient extends BusinessException {
        public NoClient(String message) {
            super(message);
        }
    }

    /** Un document CIMD vérifié reste valable cinq minutes : il n'est pas relu à chaque connexion. */
    private static final long CIMD_CHECK_TTL_MS = 5 * 60_000L;

    private final ConnectorAppRepository apps;
    private final McpOAuthRegistrationRepository registrations;
    private final McpOAuthClient client;
    private final McpOAuthSettings settings;
    private final Environment environment;

    private final Map<String, Long> cimdChecked = new ConcurrentHashMap<>();

    /**
     * Le client à présenter. {@code pinnedIssuer} : le serveur d'autorisation est celui que le préréglage épingle, celui
     * que désigne son serveur officiel ; seul celui-là reçoit un client enregistré d'avance (l'application de
     * l'entreprise, ou la nôtre) et son secret. Tout autre émetteur passe par CIMD ou l'inscription dynamique, sans secret
     * de l'entreprise ni de TaskForce.
     */
    @Transactional
    public RegisteredClient clientFor(Long workspaceId, String connectorKey, DiscoveredAuth auth, String redirectUri,
                                      boolean pinnedIssuer) {
        // 1. Un client enregistré d'avance, chez l'émetteur épinglé seulement : celui de l'entreprise, puis le nôtre.
        if (pinnedIssuer) {
            ConnectorApp company = connectorKey == null ? null
                : apps.findByWorkspaceIdAndConnectorKey(workspaceId, connectorKey).orElse(null);
            if (company != null) {
                return new RegisteredClient(company.getClientId(), blankToNull(company.getClientSecret()), COMPANY);
            }
            RegisteredClient ours = ours(connectorKey);
            if (ours != null) return ours;
        }
        // 2. Notre document de métadonnées, quand le serveur l'accepte et qu'il répond comme il faut.
        String cimd = settings.cimdUrl();
        if (auth.cimdSupported() && cimd != null && cimdServes(cimd, redirectUri)) {
            return new RegisteredClient(cimd, null, CIMD);
        }
        // 3. L'inscription dynamique, gardée par émetteur.
        if (auth.registrationEndpoint() != null) return dynamic(auth, redirectUri);
        throw new NoClient("This tool doesn't let TaskForce register on its own: its admin has to set up an app.");
    }

    /**
     * Le client d'un outil servi par l'API de son éditeur (Google, Microsoft), qui n'offre ni CIMD ni inscription
     * dynamique : celui de l'entreprise, sinon le nôtre, lu dans {@code <préfixe>_CLIENT_ID} et
     * {@code <préfixe>_CLIENT_SECRET} ({@code TF_GOOGLE}, {@code TF_MICROSOFT} ; jamais dans le dépôt) ; sinon
     * {@link NoClient}.
     */
    @Transactional(readOnly = true)
    public RegisteredClient clientForApi(Long workspaceId, String connectorKey, String envPrefix) {
        ConnectorApp company = connectorKey == null ? null
            : apps.findByWorkspaceIdAndConnectorKey(workspaceId, connectorKey).orElse(null);
        if (company != null) {
            return new RegisteredClient(company.getClientId(), blankToNull(company.getClientSecret()), COMPANY);
        }
        String id = envPrefix == null ? null : blankToNull(environment.getProperty(envPrefix + "_CLIENT_ID"));
        if (id == null) {
            throw new NoClient("TaskForce's app for this tool isn't set up on this instance: its admin has to set it up.");
        }
        return new RegisteredClient(id, blankToNull(environment.getProperty(envPrefix + "_CLIENT_SECRET")), OURS);
    }

    /** L'identifiant de notre client chez un éditeur servi par son API, quand l'instance l'a ; nul sinon. */
    public String ourClientId(String envPrefix) {
        return envPrefix == null ? null : blankToNull(environment.getProperty(envPrefix + "_CLIENT_ID"));
    }

    /** Notre client enregistré chez l'éditeur, s'il est configuré pour cette clé. */
    RegisteredClient ours(String connectorKey) {
        if (connectorKey == null || connectorKey.isBlank()) return null;
        String prefix = "TF_MCP_" + connectorKey.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "_");
        String id = blankToNull(environment.getProperty(prefix + "_CLIENT_ID"));
        if (id == null) return null;
        return new RegisteredClient(id, blankToNull(environment.getProperty(prefix + "_CLIENT_SECRET")), OURS);
    }

    /** Oublie une inscription dynamique que le serveur ne reconnaît plus (elle se refait à la connexion suivante). */
    @Transactional
    public void forget(String issuer, String redirectUri) {
        registrations.deleteByIssuerAndRedirectUri(issuer, redirectUri);
    }

    // -------------------------------------------------------------------------

    private RegisteredClient dynamic(DiscoveredAuth auth, String redirectUri) {
        McpOAuthRegistration known = registrations.findByIssuerAndRedirectUri(auth.issuer(), redirectUri).orElse(null);
        if (known != null) return new RegisteredClient(known.getClientId(), blankToNull(known.getClientSecret()), DCR);
        JsonNode reg = client.postJson(auth.registrationEndpoint(), dcrBody(redirectUri));
        String clientId = reg.path("client_id").asText(null);
        if (clientId == null || clientId.isBlank()) throw new BusinessException("The DCR response has no client_id");
        String secret = blankToNull(reg.path("client_secret").asText(null));
        registrations.save(McpOAuthRegistration.builder().issuer(auth.issuer()).redirectUri(redirectUri)
            .clientId(clientId).clientSecret(secret).build());
        return new RegisteredClient(clientId, secret, DCR);
    }

    /** Le corps de l'inscription : un client public (PKCE), du type de l'app qui le présente (norme MCP). */
    Map<String, Object> dcrBody(String redirectUri) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("client_name", settings.clientName());
        m.put("redirect_uris", List.of(redirectUri));
        m.put("grant_types", List.of("authorization_code", "refresh_token"));
        m.put("response_types", List.of("code"));
        m.put("token_endpoint_auth_method", "none");
        m.put("application_type", settings.applicationType());
        return m;
    }

    /**
     * Notre document CIMD répond-il, avec son adresse pour identifiant et cette adresse de retour ? Sinon le serveur
     * d'autorisation le refuserait au retour du navigateur : mieux vaut passer à l'inscription dynamique.
     */
    private boolean cimdServes(String cimdUrl, String redirectUri) {
        String key = cimdUrl + " " + redirectUri;
        Long at = cimdChecked.get(key);
        if (at != null && System.currentTimeMillis() - at < CIMD_CHECK_TTL_MS) return true;
        JsonNode doc = client.getJsonOrNull(cimdUrl);
        boolean ok = doc != null && cimdUrl.equals(doc.path("client_id").asText(null));
        if (ok) {
            boolean listed = false;
            for (JsonNode uri : doc.path("redirect_uris")) listed |= redirectUri.equals(uri.asText());
            ok = listed;
        }
        if (ok) cimdChecked.put(key, System.currentTimeMillis());
        else log.info("Document CIMD {} indisponible pour {} : inscription dynamique a la place", LogSafe.of(cimdUrl),
            LogSafe.of(redirectUri));
        return ok;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
