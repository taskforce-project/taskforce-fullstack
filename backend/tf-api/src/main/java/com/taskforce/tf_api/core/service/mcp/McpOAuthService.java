package com.taskforce.tf_api.core.service.mcp;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.ConnectionPath;
import com.taskforce.tf_api.core.enums.ConnectionState;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.McpOAuthState;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.repository.McpOAuthStateRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;
import com.taskforce.tf_api.core.service.integration.ConnectorPreset;
import com.taskforce.tf_api.core.service.mcp.McpOAuthDiscovery.DiscoveredAuth;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.util.LogSafe;
import com.taskforce.tf_api.shared.security.SsrfGuard;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Le flux de connexion à un serveur MCP (TF-MCP-02, séance n°22 R154) : pour la personne, toujours le même geste, un
 * clic, le navigateur, la connexion chez l'éditeur, le retour, « Connected as ... ». Derrière, TaskForce prend le
 * chemin que l'éditeur permet ({@link #connect}) : l'OAuth avec le client que choisit {@link McpClientRegistrar}
 * (application de l'entreprise, la nôtre, CIMD, DCR), la clé guidée, un serveur public, ou l'étape de l'administrateur.
 *
 * <p>Securite : SsrfGuard sur l'URL fournie et sur chaque endpoint découvert ; PKCE S256 ; {@code state} anti-CSRF
 * resolvant la connexion au callback ; {@code iss} vérifié au retour (RFC 9207) ; seules les portées strictement utiles
 * (la lecture par défaut) ; tokens chiffres (via {@link McpTokenService}) et rangés avec leur émetteur. Le callback
 * garde le code avec son {@code state} et <b>redirige toujours</b> vers l'UI (succes ou erreur), jamais une erreur brute
 * au navigateur ; l'app, connectée, finit l'échange, et seule la personne qui a lancé le flux le peut
 * ({@link #complete}). Sur l'app desktop, le navigateur revient sur la coque (127.0.0.1, port fixe) qui remet le code au
 * backend local puis ramène l'app, qui finit de même : aucun jeton ne passe par notre serveur.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class McpOAuthService {

    private static final Duration STATE_TTL = Duration.ofMinutes(10);
    /** Les erreurs d'un éditeur qui disent que son administrateur doit d'abord agir. */
    private static final Set<String> ADMIN_ERRORS = Set.of("consent_required", "admin_consent_required",
        "admin_approval_required", "unauthorized_client", "interaction_required", "access_restricted");

    private final McpOAuthDiscovery discovery;
    private final McpOAuthClient client;
    private final McpOAuthStateRepository stateRepository;
    private final WorkspaceRepository workspaceRepository;
    private final UserRepository userRepository;
    private final McpTokenService tokenService;
    private final WorkspaceMcpService workspaceMcp;
    private final McpClientRegistrar registrar;
    private final McpOAuthSettings settings;
    private final ConnectorCatalog catalog;
    private final ConnectorAppRepository apps;
    private final ConnectorConnectionRepository connections;
    private final ObjectMapper objectMapper;
    private final AuthorizationService authorization;

    private final SecureRandom random = new SecureRandom();

    /** La garde anti-SSRF des adresses du flux : toujours levée, sauf dans les essais de contrat (faux serveur local). */
    private java.util.function.Consumer<String> urlGuard = SsrfGuard::assertPublicHttpUrl;

    /** Essais de contrat seulement : le faux serveur d'autorisation écoute sur 127.0.0.1. */
    void allowLocalServersForContractTests() {
        urlGuard = url -> { };
    }

    /** L'émetteur et l'adresse de l'API d'un éditeur, remplacés par ceux d'un faux éditeur (essais de contrat seulement). */
    private final Map<String, String[]> apiForContractTests = new java.util.concurrent.ConcurrentHashMap<>();

    void pointApiForContractTests(String connectorKey, String issuer, String base) {
        apiForContractTests.put(connectorKey, new String[] { issuer, base });
    }

    /** Ce que demande une connexion. {@code mcpUrl} : l'adresse d'un serveur ajouté à la main, ou celle que l'entreprise
     *  a créée chez l'éditeur ; nulle pour un préréglage. {@code token} : la clé guidée. */
    public record ConnectRequest(String connectorKey, String name, String mcpUrl, String token, String authHeader,
                                 boolean shared, boolean allowWrites, boolean localApproved, String returnTo) {}

    /**
     * La suite du geste, pour l'écran : {@code browser} (ouvrir {@code authorizeUrl}), {@code connected}, {@code admin}
     * (la phrase et le lien à envoyer à l'administrateur), {@code company-app} (l'administrateur saisit l'application
     * de l'entreprise), {@code key} (la clé guidée), {@code local} (accorder un serveur local).
     */
    public record ConnectOutcome(String next, String authorizeUrl, String message) {
        static ConnectOutcome browser(String url) {
            return new ConnectOutcome("browser", url, null);
        }

        static ConnectOutcome of(String next, String message) {
            return new ConnectOutcome(next, null, message);
        }
    }

    /**
     * Le geste « Connect » : TaskForce choisit le chemin. Une clé donnée se garde (D) ; un préréglage par clé seule
     * demande la clé ; un outil qui exige l'application de l'entreprise l'attend ; un serveur public se connecte tel
     * quel ; sinon l'OAuth, avec le premier client possible. Rôle vérifié en amont pour une connexion partagée.
     */
    @Transactional
    public ConnectOutcome connect(Workspace ws, User person, boolean manager, ConnectRequest req) {
        Optional<ConnectorPreset> preset = catalog.preset(req.connectorKey());
        // Un préréglage joint toujours son serveur officiel ; une autre adresse demandée pour sa clé est refusée.
        String url = catalog.serverFor(req.connectorKey(), req.mcpUrl(), req.allowWrites());
        if (preset.isPresent() && preset.get().api() != null) return connectApi(ws, person, manager, req, preset.get());
        ConnectionPath path = preset.map(ConnectorPreset::connection).orElse(ConnectionPath.SELF_REGISTRATION);
        if (url == null || url.isBlank()) {
            if (path == ConnectionPath.SERVER_URL) return ConnectOutcome.of("key", null);
            throw new BusinessException("Required field: mcpUrl");
        }
        if (req.token() != null && !req.token().isBlank()) {
            saveServer(ws, person, req, url);
            return ConnectOutcome.of("connected", null);
        }
        if (path == ConnectionPath.API_KEY) return ConnectOutcome.of("key", null);
        if (path == ConnectionPath.COMPANY_APP
                && apps.findByWorkspaceIdAndConnectorKey(ws.getId(), req.connectorKey()).isEmpty()) {
            return adminStep(preset.orElse(null), manager);
        }
        try {
            if (path == ConnectionPath.OPEN || McpClient.isLocal(url)) {
                saveServer(ws, person, req, url);
                return ConnectOutcome.of("connected", null);
            }
            McpOAuthClient.Probe probe = client.probe(url);
            if (probe.open()) {
                saveServer(ws, person, req, url);
                return ConnectOutcome.of("connected", null);
            }
            return ConnectOutcome.browser(start(ws, person.getId(), req, url));
        } catch (WorkspaceMcpService.LocalServerNeedsApproval local) {
            return ConnectOutcome.of("local", local.getMessage());
        } catch (McpOAuthDiscovery.NoOAuth noOAuth) {
            // Ni OAuth ni accès public : le serveur attend une clé.
            return ConnectOutcome.of("key", null);
        } catch (McpClientRegistrar.NoClient none) {
            if (preset.isPresent() && preset.get().apiKey() != null && preset.get().admin() == null) {
                return ConnectOutcome.of("key", null);
            }
            return adminStep(preset.orElse(null), manager);
        }
    }

    /**
     * Un outil servi par l'API de son éditeur (Google Drive, Microsoft 365), sans serveur MCP : le même geste, la même
     * connexion par personne et le même retour ; le client est celui de l'entreprise, sinon le nôtre. Sans l'un ni
     * l'autre, l'étape de l'administrateur : un propriétaire ou un administrateur saisit l'application de l'entreprise.
     */
    private ConnectOutcome connectApi(Workspace ws, User person, boolean manager, ConnectRequest req,
                                      ConnectorPreset preset) {
        try {
            return ConnectOutcome.browser(startApi(ws, person.getId(), req, preset));
        } catch (McpClientRegistrar.NoClient none) {
            return ConnectOutcome.of(manager ? "company-app" : "admin",
                "This tool needs an app registered by your admin before anyone can connect.");
        }
    }

    /**
     * Démarre la connexion à l'API d'un éditeur : la metadata de son émetteur, notre client ou celui de l'entreprise,
     * PKCE S256, les seules portées du préréglage (la lecture par défaut), les paramètres que l'éditeur attend en plus.
     * Le retour est celui des serveurs MCP ({@link #callback}).
     */
    @Transactional
    public String startApi(Workspace ws, Long userId, ConnectRequest req, ConnectorPreset preset) {
        ConnectorPreset.Api api = preset.api();
        String[] fake = apiForContractTests.get(preset.key());
        String issuer = fake != null ? fake[0] : settings.apiIssuer(api.issuer());
        String base = fake != null ? fake[1] : api.base();
        urlGuard.accept(issuer);
        DiscoveredAuth auth = discovery.discoverIssuer(issuer);
        urlGuard.accept(auth.authorizationEndpoint());
        String redirectUri = settings.redirectUri();
        McpClientRegistrar.RegisteredClient registered = registrar.clientForApi(ws.getId(), preset.key(), api.app());

        String verifier = urlSafe(48);
        String state = urlSafe(24);
        String scope = String.join(" ", preset.scopesFor(req.allowWrites()));
        stateRepository.save(McpOAuthState.builder()
            .state(state).workspaceId(ws.getId()).userId(userId)
            .connectorKey(preset.key()).mcpName(null).mcpUrl(base).codeVerifier(verifier)
            .tokenEndpoint(auth.tokenEndpoint()).clientId(registered.clientId()).clientSecret(registered.clientSecret())
            .redirectUri(redirectUri).scope(scope).issuer(auth.issuer())
            .returnTo(sanitizeReturnTo(req.returnTo()))
            .shared(req.shared()).allowWrites(req.allowWrites()).resource(null)
            .revocationEndpoint(auth.revocationEndpoint()).clientSource(registered.source())
            .issRequired(auth.issParameterSupported())
            .expiresAt(LocalDateTime.now().plus(STATE_TTL))
            .build());
        return authorizeUrl(auth.authorizationEndpoint(), registered.clientId(), redirectUri, scope, state,
            s256(verifier), null, api.authorize());
    }

    /** L'outil de cette clé est-il servi par l'API de son éditeur ? Son API, sinon nulle. */
    private ConnectorPreset.Api apiOf(String connectorKey) {
        return catalog.preset(connectorKey).map(ConnectorPreset::api).orElse(null);
    }

    /** L'étape de l'administrateur : l'administrateur saisit l'application de l'entreprise, la personne lui écrit. */
    private ConnectOutcome adminStep(ConnectorPreset preset, boolean manager) {
        String text = preset != null && preset.admin() != null ? adminText(preset.admin().text())
            : "This tool needs an app registered by your admin before anyone can connect.";
        return ConnectOutcome.of(manager ? "company-app" : "admin", text);
    }

    /** La phrase de l'administrateur, avec l'adresse de retour de cette instance. */
    public String adminText(String text) {
        if (text == null) return null;
        return text.replace("{redirectUri}", settings.redirectUri()).replace("{redirectHost}", settings.redirectHost());
    }

    private void saveServer(Workspace ws, User person, ConnectRequest req, String url) {
        workspaceMcp.connectServer(ws, person, new WorkspaceMcpService.ServerRequest(req.connectorKey(), req.name(),
            url, req.token(), req.authHeader(), null, req.shared(), req.localApproved()));
    }

    /**
     * Demarre le flux et renvoie l'URL d'autorisation (le front y envoie le navigateur). Autorisation (membre, et
     * gestionnaire pour une connexion partagée) faite en amont par le controleur. La cle est celle d'un prereglage du
     * catalogue ou d'un serveur personnalise, dont le nom est garde jusqu'au callback (cf.
     * {@link WorkspaceMcpService#resolveServer}).
     */
    @Transactional
    public String start(Workspace ws, Long userId, String connectorKey, String name, String mcpUrl, String returnTo) {
        return start(ws, userId, new ConnectRequest(connectorKey, name, mcpUrl, null, null, false, false, false,
            returnTo), mcpUrl);
    }

    @Transactional
    public String start(Workspace ws, Long userId, ConnectRequest req, String requestedUrl) {
        // La clé d'un préréglage mène toujours à son serveur officiel : une autre adresse est refusée avant tout appel.
        String mcpUrl = catalog.serverFor(req.connectorKey(), requestedUrl, req.allowWrites());
        if (mcpUrl == null) throw new BusinessException("Required field: mcpUrl");
        urlGuard.accept(mcpUrl);
        WorkspaceMcpService.ServerIdentity server = workspaceMcp.resolveServer(ws.getId(), req.connectorKey(), req.name());
        DiscoveredAuth auth = discovery.discover(mcpUrl);
        // Le navigateur sera redirige vers authorization_endpoint (issu de la metadata d'un serveur
        // semi-fiable) : on le valide comme http(s) PUBLIC (jamais une cible interne, jamais un schema
        // exotique type javascript:). Les autres endpoints sont deja gardes au moment du fetch serveur.
        urlGuard.accept(auth.authorizationEndpoint());
        String redirectUri = settings.redirectUri();
        // L'émetteur épinglé : celui que désigne le serveur officiel du préréglage, ou, pour un serveur que l'entreprise
        // tient, celui épinglé sur son application. Lui seul reçoit un client enregistré.
        boolean official = catalog.preset(server.connectorKey()).map(p -> p.serves(mcpUrl)).orElse(false);
        McpClientRegistrar.RegisteredClient registered = registrar.clientFor(ws.getId(), server.connectorKey(), auth,
            redirectUri, official, userId != null && authorization.isManager(ws.getId(), userId));

        String verifier = urlSafe(48);
        String state = urlSafe(24);
        String scope = scopeFor(server.connectorKey(), auth, req.allowWrites());
        String resource = auth.resource() != null ? auth.resource() : mcpUrl;

        stateRepository.save(McpOAuthState.builder()
            .state(state).workspaceId(ws.getId()).userId(userId)
            .connectorKey(server.connectorKey()).mcpName(server.name()).mcpUrl(mcpUrl).codeVerifier(verifier)
            .tokenEndpoint(auth.tokenEndpoint()).clientId(registered.clientId()).clientSecret(registered.clientSecret())
            .redirectUri(redirectUri).scope(scope).issuer(auth.issuer())
            .returnTo(sanitizeReturnTo(req.returnTo()))
            .shared(req.shared()).allowWrites(req.allowWrites()).resource(resource)
            .revocationEndpoint(auth.revocationEndpoint()).clientSource(registered.source())
            .issRequired(auth.issParameterSupported())
            .expiresAt(LocalDateTime.now().plus(STATE_TTL))
            .build());

        return authorizeUrl(auth.authorizationEndpoint(), registered.clientId(), redirectUri, scope, state,
            s256(verifier), resource);
    }

    /**
     * Les portées demandées (R158) : celles du préréglage, la lecture par défaut ; pour un serveur sans préréglage,
     * celles que son 401 demande, sinon aucune (l'éditeur applique sa portée par défaut), jamais toutes celles qu'il
     * annonce.
     */
    String scopeFor(String connectorKey, DiscoveredAuth auth, boolean allowWrites) {
        List<String> declared = catalog.preset(connectorKey).map(p -> p.scopesFor(allowWrites)).orElse(List.of());
        if (!declared.isEmpty()) return String.join(" ", declared);
        return auth.challengeScope();
    }

    /** Le retour du navigateur, tel que le contrôleur le reçoit. */
    @Transactional
    public String callback(String state, String code, String error) {
        return callback(state, code, error, null);
    }

    /**
     * Callback OAuth (endpoint public) : resout tout depuis le {@code state} (jamais l'URL), vérifie l'émetteur, garde
     * le code avec le {@code state}, et renvoie vers l'UI, où l'app, connectée, finit l'échange ({@link #complete}).
     */
    @Transactional
    public String callback(String state, String code, String error, String iss) {
        return callback(state, code, error, iss, null);
    }

    /**
     * Le retour, avec la description de l'erreur que l'éditeur donne : chez Microsoft, le code {@code AADSTS} dit si
     * c'est l'administrateur de l'entreprise qui doit accorder d'abord (TF-J2-14). Jamais montrée à la personne.
     *
     * <p>Le code n'est pas échangé ici : il est gardé avec son {@code state}, et l'adresse de retour porte un jeton à
     * usage unique que seul ce navigateur reçoit ({@code finish}). L'app, connectée, le présente pour finir ; seule la
     * personne qui a lancé le flux le peut. Le retour ne retire jamais le flux : un second retour le laisse tel quel, et
     * un flux qui n'aboutit pas s'efface à son échéance.</p>
     */
    @Transactional
    public String callback(String state, String code, String error, String iss, String errorDescription) {
        McpOAuthState row = (state == null || state.isBlank()) ? null
            : stateRepository.findById(state).orElse(null);
        if (row == null) return settings.appBase() + "/?mcp=error"; // state inconnu/expire : retour generique
        try {
            if (error != null && !error.isBlank()) {
                if (ADMIN_ERRORS.contains(error) || adminRequired(row.getConnectorKey())
                        || microsoftAdminFirst(row.getConnectorKey(), errorDescription)) {
                    markWaitingForAdmin(row);
                    return appRedirect(row, "admin");
                }
                throw new BusinessException("refus : " + error);
            }
            if (row.getExpiresAt().isBefore(LocalDateTime.now())) throw new BusinessException("state expire");
            if (code == null || code.isBlank()) throw new BusinessException("code manquant");
            // Un state ne revient qu'une fois.
            if (row.getCode() != null || row.getFinishHash() != null) throw new BusinessException("retour deja recu");
            // RFC 9207 : le retour doit venir de l'émetteur attendu (attaque par mélange de serveurs).
            if (iss != null && !iss.isBlank() && !sameIssuer(iss, row.getIssuer())) {
                throw new BusinessException("emetteur inattendu");
            }
            if (row.isIssRequired() && (iss == null || iss.isBlank())) throw new BusinessException("emetteur absent");

            String finish = urlSafe(24);
            row.setCode(code);
            row.setFinishHash(sha256Hex(finish));
            stateRepository.save(row);
            return appRedirect(row, "finish") + "&state=" + enc(row.getState()) + "&finish=" + enc(finish);
        } catch (Exception e) {
            log.warn("Callback OAuth MCP echoue (connector={}) : {}", LogSafe.of(row.getConnectorKey()), LogSafe.of(e.getMessage()));
            return appRedirect(row, "error");
        }
    }

    /** Comment l'app a fini une connexion : {@code connected} ou {@code error}, et l'outil, pour son message. */
    public record Completion(String outcome, String connectorKey) {}

    /**
     * L'app, connectée, finit la connexion revenue du navigateur : seulement avec le jeton que ce navigateur a reçu,
     * seulement pour la personne qui a créé le {@code state}, encore membre de l'espace (et gestionnaire pour une
     * connexion partagée). Puis l'échange du code, les jetons sur sa connexion (ou celle de l'espace), la liste des outils
     * figée, le cache invalidé. Usage unique : dès que le jeton du retour correspond, réussi ou non, le flux s'efface ; un
     * mauvais jeton le laisse tel quel.
     */
    @Transactional
    public Completion complete(Long userId, String state, String finish) {
        McpOAuthState row = (state == null || state.isBlank()) ? null
            : stateRepository.findById(state).orElse(null);
        if (row == null) return new Completion("error", null);
        // Le jeton du retour d'abord : un mauvais jeton, ou un flux qui n'est pas encore revenu, le laisse tel quel.
        if (row.getCode() == null || row.getFinishHash() == null || finish == null || finish.isBlank()
                || !MessageDigest.isEqual(sha256Hex(finish).getBytes(StandardCharsets.US_ASCII),
                    row.getFinishHash().getBytes(StandardCharsets.US_ASCII))) {
            log.warn("Fin de connexion MCP refusee (connector={}) : retour inconnu", LogSafe.of(row.getConnectorKey()));
            return new Completion("error", row.getConnectorKey());
        }
        try {
            if (userId == null || !userId.equals(row.getUserId())) {
                throw new BusinessException("le flux a ete lance par une autre personne");
            }
            if (row.getExpiresAt().isBefore(LocalDateTime.now())) throw new BusinessException("state expire");
            if (!authorization.isMember(row.getWorkspaceId(), userId)
                    || (row.isShared() && !authorization.isManager(row.getWorkspaceId(), userId))) {
                throw new BusinessException("la personne n'a plus acces a l'espace");
            }

            JsonNode tok = client.postForm(row.getTokenEndpoint(), exchangeForm(row, row.getCode()));

            ConnectorConnection conn = connectionFor(row);
            conn.setAccountLabel(accountLabel(tok));
            tokenService.storeInitialTokens(conn, tok, new McpTokenService.OAuthGrant(row.getMcpUrl(), row.getMcpName(),
                row.getIssuer(), row.getClientId(), row.getClientSecret(), row.getTokenEndpoint(),
                row.getRevocationEndpoint(), row.getClientSource(), row.getResource()));
            ConnectorPreset.Api api = apiOf(row.getConnectorKey());
            if (api != null) tokenService.markApi(conn, api.kind(), tok.path("scope").asText(null));
            // La liste des outils, figée à la connexion (R158).
            conn.setToolsPin(null);
            workspaceMcp.pinQuietly(conn);
            workspaceMcp.invalidate(row.getWorkspaceId());
            // Un serveur que l'entreprise tient : la première connexion d'un propriétaire ou d'un administrateur qui aboutit
            // par l'application de l'entreprise épingle son émetteur sur elle.
            if (McpClientRegistrar.COMPANY.equals(row.getClientSource()) && api == null
                    && !catalog.preset(row.getConnectorKey()).map(p -> p.serves(row.getMcpUrl())).orElse(false)
                    && authorization.isManager(row.getWorkspaceId(), userId)) {
                registrar.pinCompanyIssuer(row.getWorkspaceId(), row.getConnectorKey(), row.getIssuer());
            }
            return new Completion("connected", row.getConnectorKey());
        } catch (Exception e) {
            log.warn("Fin de connexion MCP echouee (connector={}) : {}", LogSafe.of(row.getConnectorKey()),
                LogSafe.of(e.getMessage()));
            return new Completion("error", row.getConnectorKey());
        } finally {
            stateRepository.deleteById(row.getState()); // usage unique, dès que le jeton du retour correspond
        }
    }

    // -------------------------------------------------------------------------

    /** La connexion que le retour remplit : celle de la personne qui a lancé le flux, ou celle de l'espace. */
    private ConnectorConnection connectionFor(McpOAuthState row) {
        return connectionFor(row, true);
    }

    /**
     * La connexion de ce flux : celle de la personne qui l'a lancé, ou celle de l'espace. {@code madeNow} : la personne
     * la fait maintenant ; sinon, une connexion déjà gardée garde la personne qui l'a faite (une ligne neuve est à elle).
     */
    private ConnectorConnection connectionFor(McpOAuthState row, boolean madeNow) {
        Workspace ws = workspaceRepository.getReferenceById(row.getWorkspaceId());
        User person = row.getUserId() == null ? null : userRepository.findById(row.getUserId()).orElse(null);
        if (person == null && !row.isShared()) throw new BusinessException("la personne n'existe plus");
        ConnectorConnection conn = workspaceMcp.ownConnection(ws, person, row.getConnectorKey(), row.isShared());
        if (person != null && (madeNow || conn.getId() == null)) conn.setConnectedBy(person);
        return conn;
    }

    /**
     * L'éditeur attend son administrateur : la connexion le dit, jusqu'au prochain essai. Une connexion qui marche reste
     * telle quelle ; une connexion déjà gardée (à refaire, par exemple) ne change que d'état, ses jetons et la personne qui
     * l'a faite restent avec elle, et sa déconnexion révoque les jetons ; une connexion neuve n'a que son adresse, sans
     * jeton.
     */
    private void markWaitingForAdmin(McpOAuthState row) {
        ConnectorConnection conn = connectionFor(row, false);
        if (conn.getId() != null && conn.getState() == ConnectionState.CONNECTED) return; // une connexion qui marche reste
        if (conn.getId() == null) {
            Map<String, String> config = new LinkedHashMap<>();
            config.put(WorkspaceMcpService.CONFIG_URL, row.getMcpUrl());
            if (row.getMcpName() != null) config.put(WorkspaceMcpService.CONFIG_NAME, row.getMcpName());
            try {
                conn.setConfig(objectMapper.writeValueAsString(config));
            } catch (Exception e) {
                conn.setConfig("{}");
            }
        }
        conn.setState(ConnectionState.WAITING_FOR_ADMIN);
        connections.save(conn);
        workspaceMcp.invalidate(row.getWorkspaceId());
    }

    /**
     * Microsoft refuse parce que la politique de l'entreprise réserve ces permissions à son administrateur : AADSTS65001
     * (pas d'accord donné), 90094 et 90095 (l'accord de l'administrateur est requis), 900941 (une application dont
     * l'éditeur n'est pas vérifié, quand l'entreprise juge le risque). Seulement pour Microsoft Graph.
     */
    private boolean microsoftAdminFirst(String connectorKey, String description) {
        ConnectorPreset.Api api = apiOf(connectorKey);
        if (api == null || !"microsoft-graph".equals(api.kind()) || description == null) return false;
        return MICROSOFT_ADMIN.matcher(description).find();
    }

    private static final java.util.regex.Pattern MICROSOFT_ADMIN =
        java.util.regex.Pattern.compile("AADSTS(65001|90094|90095|900941)\\b");

    private boolean adminRequired(String connectorKey) {
        return catalog.preset(connectorKey).map(p -> p.admin() != null && p.admin().required()).orElse(false);
    }

    /**
     * Le compte chez l'éditeur, pour « Connected as ... » : ce que la réponse du jeton en dit (le jeton d'identité
     * OpenID Connect, sinon les champs courants), lu pour l'affichage seulement ; nul quand l'éditeur ne le dit pas.
     */
    String accountLabel(JsonNode tok) {
        String idToken = tok.path("id_token").asText(null);
        if (idToken != null) {
            JsonNode claims = jwtClaims(idToken);
            String label = first(claims, "email", "preferred_username", "name");
            if (label != null) return trim(label);
        }
        String label = first(tok, "email", "user_email", "login", "username");
        if (label == null) label = first(tok.path("user"), "email", "login", "name");
        if (label == null) label = first(tok.path("owner").path("user").path("person"), "email");
        if (label == null) label = first(tok.path("owner").path("user"), "name");
        if (label == null) label = first(tok.path("authed_user"), "email", "name");
        if (label == null) label = first(tok, "workspace_name", "team_name");
        if (label == null) label = first(tok.path("team"), "name");
        return label == null ? null : trim(label);
    }

    private JsonNode jwtClaims(String jwt) {
        String[] parts = jwt.split("\\.");
        if (parts.length < 2) return objectMapper.createObjectNode();
        try {
            return objectMapper.readTree(Base64.getUrlDecoder().decode(parts[1]));
        } catch (Exception e) {
            return objectMapper.createObjectNode();
        }
    }

    private static String first(JsonNode node, String... fields) {
        if (node == null || !node.isObject()) return null;
        for (String f : fields) {
            String v = node.path(f).asText(null);
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }

    private static String trim(String label) {
        String v = label.strip();
        return v.length() > 255 ? v.substring(0, 255) : v;
    }

    private Map<String, String> exchangeForm(McpOAuthState row, String code) {
        Map<String, String> f = new LinkedHashMap<>();
        f.put("grant_type", "authorization_code");
        f.put("code", code);
        f.put("redirect_uri", row.getRedirectUri());
        f.put("client_id", row.getClientId());
        if (row.getClientSecret() != null && !row.getClientSecret().isBlank()) {
            f.put("client_secret", row.getClientSecret());
        }
        f.put("code_verifier", row.getCodeVerifier());
        // L'API d'un éditeur (Google, Entra) refuse resource (RFC 8707) : seulement pour un serveur MCP.
        if (apiOf(row.getConnectorKey()) == null) {
            f.put("resource", row.getResource() != null ? row.getResource() : row.getMcpUrl());
        }
        return f;
    }

    private String authorizeUrl(String authEp, String clientId, String redirectUri, String scope,
                                String state, String challenge, String resource) {
        return authorizeUrl(authEp, clientId, redirectUri, scope, state, challenge, resource, Map.of());
    }

    /** L'adresse d'autorisation ; {@code resource} nul pour l'API d'un éditeur, {@code extra} ce qu'il attend en plus. */
    private String authorizeUrl(String authEp, String clientId, String redirectUri, String scope,
                                String state, String challenge, String resource, Map<String, String> extra) {
        StringBuilder u = new StringBuilder(authEp)
            .append(authEp.contains("?") ? "&" : "?")
            .append("response_type=code")
            .append("&client_id=").append(enc(clientId))
            .append("&redirect_uri=").append(enc(redirectUri))
            .append("&state=").append(enc(state))
            .append("&code_challenge=").append(enc(challenge))
            .append("&code_challenge_method=S256");
        if (resource != null) u.append("&resource=").append(enc(resource));
        if (scope != null && !scope.isBlank()) u.append("&scope=").append(enc(scope));
        if (extra != null) extra.forEach((k, v) -> u.append('&').append(enc(k)).append('=').append(enc(v)));
        return u.toString();
    }

    private String appRedirect(McpOAuthState row, String status) {
        // Retour « fluide » : si un chemin de retour a été fourni au start (ex. le wizard de projet),
        // on y renvoie ; sinon, retour à la page Settings > Intégrations (comportement par défaut). La clé de l'outil
        // suit, pour que l'écran rouvre sa fiche ; jamais le compte ni une donnée personnelle dans l'adresse.
        String tail = "mcp=" + status + "&connector=" + enc(row.getConnectorKey());
        String rt = row.getReturnTo();
        if (rt != null && !rt.isBlank()) {
            return settings.appBase() + rt + (rt.contains("?") ? "&" : "?") + tail;
        }
        String slug = workspaceRepository.findById(row.getWorkspaceId()).map(Workspace::getSlug).orElse("");
        return settings.appBase() + "/" + slug + "/settings?section=integrations&" + tail;
    }

    /**
     * N'autorise qu'un chemin applicatif RELATIF sûr (anti open-redirect) : doit commencer par "/",
     * pas "//" (protocol-relative), pas de schéma ni de backslash. Sinon → {@code null} (retour défaut).
     */
    private static String sanitizeReturnTo(String returnTo) {
        if (returnTo == null || returnTo.isBlank()) return null;
        String rt = returnTo.trim();
        if (!rt.startsWith("/") || rt.startsWith("//") || rt.contains("\\") || rt.contains("://")) return null;
        return rt.length() > 500 ? rt.substring(0, 500) : rt;
    }

    private static boolean sameIssuer(String a, String b) {
        if (b == null) return false;
        return withoutTrailingSlashes(a).equals(withoutTrailingSlashes(b));
    }

    /** Une adresse sans ses barres finales, sans expression régulière sur une valeur venue du dehors. */
    private static String withoutTrailingSlashes(String url) {
        String v = url.trim();
        int end = v.length();
        while (end > 0 && v.charAt(end - 1) == '/') end--;
        return v.substring(0, end);
    }

    private String urlSafe(int bytes) {
        byte[] b = new byte[bytes];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private static String s256(String verifier) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(d);
        } catch (Exception e) {
            throw new BusinessException("PKCE indisponible : " + e.getMessage());
        }
    }

    /** L'empreinte SHA-256 d'un jeton, en hexadécimal : seule elle est gardée. */
    private static String sha256Hex(String value) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(d);
        } catch (Exception e) {
            throw new BusinessException("Empreinte indisponible : " + e.getMessage());
        }
    }

    private static String enc(String s) {
        return java.net.URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
    }
}
