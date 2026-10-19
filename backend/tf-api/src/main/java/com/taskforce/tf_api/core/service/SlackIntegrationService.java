package com.taskforce.tf_api.core.service;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.request.SlackChannelRequest;
import com.taskforce.tf_api.core.dto.response.IntegrationStatusResponse;
import com.taskforce.tf_api.core.dto.response.SlackChannelResponse;
import com.taskforce.tf_api.core.dto.response.SlackHistoryMessage;
import com.taskforce.tf_api.core.dto.response.SlackSyncResponse;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.enums.WebhookEventType;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.OAuthState;
import com.taskforce.tf_api.core.model.SlackChannel;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.OAuthStateRepository;
import com.taskforce.tf_api.core.repository.SlackChannelRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class SlackIntegrationService {

    private static final String SLACK_OAUTH_AUTHORIZE = "https://slack.com/oauth/v2/authorize";
    private static final String SLACK_TOKEN_URL       = "https://slack.com/api/oauth.v2.access";

    @Value("${integrations.slack.client-id:}")
    private String clientId;

    @Value("${integrations.slack.client-secret:}")
    private String clientSecret;

    @Value("${app.frontend-url:http://localhost:3000}")
    private String frontendUrl;

    // Base du BACKEND pour le callback OAuth (distincte de app.url = front, cf. EmailService).
    @Value("${app.api-url:http://localhost:8080}")
    private String apiUrl;

    private final IntegrationRepository  integrationRepository;
    private final SlackChannelRepository slackChannelRepository;
    private final WorkspaceRepository    workspaceRepository;
    private final OAuthStateRepository   oauthStateRepository;
    private final RestTemplate           restTemplate;

    // Ingestion Brain OS (meme patron que PlaneIntegrationService).
    private final KnowledgeService        knowledgeService;
    private final KnowledgeNodeRepository nodeRepository;
    private final BrainSearchService      brainSearch;
    private final JdbcTemplate            jdbcTemplate;
    private final TransactionTemplate     tx;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int STATE_TTL_MINUTES = 10;
    /** Marqueur de provenance dans {@code metadata.source} (cle de deduplication cote Brain OS). */
    private static final String SOURCE = "slack";
    /** Longueur minimale (texte nettoye) pour ingerer un message : filtre le bruit (« ok », « +1 »). */
    private static final int MIN_MESSAGE_LEN = 4;
    /** Borne de securite sur le contenu ingere. */
    private static final int MAX_BODY = 6000;
    /**
     * Portées demandées au bot : publier ({@code chat:write}, et dans un canal public sans y être invité,
     * {@code chat:write.public}), lister et lire les canaux pour la synchro du Brain OS ({@code channels:read},
     * {@code channels:history}), nommer les auteurs ({@code users:read}), choisir un canal à l'installation
     * ({@code incoming-webhook}). L'app Slack de l'instance doit les déclarer.
     */
    static final String BOT_SCOPES = "chat:write,chat:write.public,channels:read,channels:history,users:read,incoming-webhook";
    /** Identifiant de canal Slack ({@code C0123456789}) : il finit dans l'URL de l'API Slack. */
    private static final Pattern CHANNEL_ID = Pattern.compile("[A-Z0-9]{9,20}");
    /** Événements envoyés à un canal choisi à l'installation (ceux du formulaire par défaut). */
    private static final String[] DEFAULT_CHANNEL_EVENTS = {WebhookEventType.ISSUE_CREATED.key()};

    /** Cache des noms d'utilisateurs Slack résolus (clé : {@code workspaceId:slackUserId}). */
    private final Map<String, String> slackUserNameCache = new java.util.concurrent.ConcurrentHashMap<>();

    // ----------------------------------------------------------------
    // OAuth flow
    // ----------------------------------------------------------------

    /**
     * Émet un {@code state} aléatoire (anti-CSRF) lié au workspace + à l'utilisateur, le persiste,
     * et construit l'URL d'autorisation Slack. Appelé via XHR authentifié.
     */
    @Transactional
    public URI buildAuthorizeUrl(String workspaceSlug, User user) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));

        oauthStateRepository.deleteByExpiresAtBefore(LocalDateTime.now());
        String state = newState();
        oauthStateRepository.save(OAuthState.builder()
            .state(state)
            .provider(IntegrationProvider.SLACK)
            .workspace(workspace)
            .user(user)
            .expiresAt(LocalDateTime.now().plusMinutes(STATE_TTL_MINUTES))
            .build());

        String callbackUrl = apiUrl + "/api/integrations/slack/callback";
        String url = SLACK_OAUTH_AUTHORIZE
            + "?client_id=" + encode(clientId)
            + "&redirect_uri=" + encode(callbackUrl)
            + "&scope=" + encode(BOT_SCOPES)
            + "&state=" + encode(state);
        return URI.create(url);
    }

    /**
     * Retour de Slack. Renvoie toujours une URL de l'application, avec {@code slack=connected} ou {@code slack=error}
     * (accès refusé, state expiré, échange échoué) : le navigateur ne reste plus sur une erreur JSON de l'API.
     */
    @Transactional
    public String handleCallback(String code, String state, String error) {
        OAuthState oauthState = state == null || state.isBlank() ? null : oauthStateRepository.findById(state)
            .filter(s -> s.getProvider() == IntegrationProvider.SLACK)
            .orElse(null);
        if (oauthState == null) return frontendUrl + "/?slack=error"; // state inconnu : workspace inconnu
        Workspace workspace = oauthState.getWorkspace();
        User installedBy = oauthState.getUser();
        boolean expired = oauthState.getExpiresAt().isBefore(LocalDateTime.now());
        oauthStateRepository.delete(oauthState); // usage unique, même en échec
        String settings = frontendUrl + "/" + workspace.getSlug() + "/settings?section=integrations&slack=";
        try {
            if (error != null && !error.isBlank()) throw new BusinessException("Slack authorization refused: " + error);
            if (expired) throw new BusinessException("OAuth state expired");
            if (code == null || code.isBlank()) throw new BusinessException("Missing authorization code");
            connect(workspace, installedBy, code);
            return settings + "connected";
        } catch (RuntimeException e) {
            log.warn("Slack connection failed for workspace {}: {}", workspace.getId(), e.getMessage());
            return settings + "error";
        }
    }

    /**
     * Échange le code, enregistre la connexion du workspace et, s'il est nouveau, le canal choisi sur l'écran
     * d'installation de Slack : les notifications marchent sans saisir d'identifiant de canal.
     */
    private void connect(Workspace workspace, User installedBy, String code) {
        // 1. Exchange code for token
        Map<String, Object> tokenResponse = exchangeCodeForToken(code);

        String botToken  = extractPath(tokenResponse, "access_token");
        String teamId    = extractPath(tokenResponse, "team.id");
        String teamName  = extractPath(tokenResponse, "team.name");

        // 2. Persist integration (upsert)
        Optional<Integration> existing = integrationRepository
            .findByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.SLACK);

        Map<String, String> meta = new HashMap<>();
        meta.put("teamId",   teamId);
        meta.put("teamName", teamName);

        Integration integration = existing.orElseGet(() ->
            Integration.builder()
                .workspace(workspace)
                .provider(IntegrationProvider.SLACK)
                .build()
        );
        integration.setAccessToken(botToken);
        integration.setMeta(meta);
        integration.setInstalledBy(installedBy);
        integrationRepository.save(integration);

        // 3. Canal choisi à l'installation (portée incoming-webhook)
        String channelId = extractPath(tokenResponse, "incoming_webhook.channel_id");
        String channelName = extractPath(tokenResponse, "incoming_webhook.channel").replaceFirst("^#", "");
        if (CHANNEL_ID.matcher(channelId).matches()
            && !slackChannelRepository.existsByWorkspaceIdAndChannelId(workspace.getId(), channelId)) {
            slackChannelRepository.save(SlackChannel.builder()
                .workspace(workspace)
                .channelId(channelId)
                .channelName(channelName.isBlank() ? channelId : channelName)
                .eventTypes(DEFAULT_CHANNEL_EVENTS.clone())
                .active(true)
                .build());
        }
    }

    private String newState() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * Déconnecte Slack : supprime la connexion et ses canaux (ils appartiennent à l'équipe Slack connectée, une
     * reconnexion à une autre équipe les aurait repris), puis révoque le jeton chez Slack, hors transaction et
     * sans bloquer la déconnexion si Slack ne répond pas.
     */
    public void disconnect(String workspaceSlug) {
        String token = tx.execute(status -> {
            Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
            String current = integrationRepository
                .findByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.SLACK)
                .map(Integration::getAccessToken)
                .orElse(null);
            integrationRepository.deleteByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.SLACK);
            slackChannelRepository.deleteByWorkspaceId(workspace.getId());
            return current;
        });
        if (token != null) revokeToken(token);
    }

    /** {@code auth.revoke} : invalide le jeton du bot (best-effort). */
    private void revokeToken(String token) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(token);
            restTemplate.exchange("https://slack.com/api/auth.revoke", HttpMethod.POST,
                new HttpEntity<>(headers), new ParameterizedTypeReference<Map<String, Object>>() {});
        } catch (RestClientException e) {
            log.warn("Slack token not revoked at disconnect: {}", e.getMessage());
        }
    }

    public IntegrationStatusResponse getStatus(String workspaceSlug) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        return integrationRepository
            .findByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.SLACK)
            .map(i -> new IntegrationStatusResponse(i.getId(), "SLACK", true, i.getMeta(), i.getConnectedAt()))
            .orElse(new IntegrationStatusResponse(null, "SLACK", false, Map.of(), null));
    }

    // ----------------------------------------------------------------
    // Channel config
    // ----------------------------------------------------------------

    @Transactional
    public SlackChannelResponse addChannel(String workspaceSlug, SlackChannelRequest req) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        String channelId = requireChannelId(req.channelId());
        if (slackChannelRepository.existsByWorkspaceIdAndChannelId(workspace.getId(), channelId)) {
            throw new BusinessException("This Slack channel is already set up. Remove it first to change its events");
        }
        List<String> events = req.eventTypes() != null ? req.eventTypes() : List.of();
        List<String> known = WebhookEventType.subscribable();
        List<String> unknown = events.stream().filter(e -> !known.contains(e)).toList();
        if (!unknown.isEmpty()) {
            throw new BusinessException("Unknown event: " + String.join(", ", unknown)
                + ". Known events: " + String.join(", ", known));
        }

        SlackChannel channel = SlackChannel.builder()
            .workspace(workspace)
            .channelId(channelId)
            .channelName(req.channelName())
            .eventTypes(events.stream().distinct().toArray(String[]::new))
            .active(true)
            .build();

        slackChannelRepository.save(channel);
        return toResponse(channel);
    }

    public List<SlackChannelResponse> getChannels(String workspaceSlug) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        return slackChannelRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId())
            .stream()
            .map(this::toResponse)
            .toList();
    }

    @Transactional
    public void deleteChannel(String workspaceSlug, Long channelId) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        slackChannelRepository.deleteByIdAndWorkspaceId(channelId, workspace.getId());
    }

    // ----------------------------------------------------------------
    // Send notification (fire-and-forget)
    // ----------------------------------------------------------------

    /**
     * Push d'un événement vers Slack (best-effort, asynchrone, fire-and-forget).
     * Poste sur chaque canal <b>actif</b> dont les {@code eventTypes} contiennent {@code eventType}
     * (ou wildcard si aucun type configuré). Ne lève jamais : les échecs sont loggués.
     */
    @Async
    public void notifyEvent(Long workspaceId, String eventType, String text) {
        dispatchEvent(workspaceId, eventType, text);
    }

    /**
     * Logique de dispatch synchrone (testable directement, sans le proxy {@code @Async}).
     * Poste sur chaque canal actif abonné à {@code eventType}.
     */
    void dispatchEvent(Long workspaceId, String eventType, String text) {
        integrationRepository
            .findByWorkspaceIdAndProvider(workspaceId, IntegrationProvider.SLACK)
            .ifPresent(integration ->
                slackChannelRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream()
                    .filter(SlackChannel::getActive)
                    .filter(c -> matchesEvent(c.getEventTypes(), eventType))
                    .forEach(c -> postMessage(integration.getAccessToken(), c.getChannelId(), text)));
    }

    // ----------------------------------------------------------------
    // Miroir (pull) : lecture de l'historique + résolution des noms
    // ----------------------------------------------------------------

    /**
     * Récupère l'historique d'un canal Slack (conversations.history) depuis {@code oldestTs} (exclu),
     * en ordre chronologique. Ne garde que les messages texte d'utilisateurs (ignore les sous-types
     * système join/leave/bot). Un refus de Slack ({@code ok:false}) devient un message qui dit quoi faire, au lieu
     * d'une synchro silencieusement vide.
     */
    @SuppressWarnings("unchecked")
    public List<SlackHistoryMessage> fetchHistory(Long workspaceId, String slackChannelId, String oldestTs) {
        String channelId = requireChannelId(slackChannelId);
        String token = requireToken(workspaceId);
        String url = "https://slack.com/api/conversations.history?channel=" + channelId + "&limit=100"
            + (oldestTs != null && !oldestTs.isBlank() ? "&oldest=" + oldestTs : "");
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        ResponseEntity<Map<String, Object>> resp = restTemplate.exchange(
            url, HttpMethod.GET, new HttpEntity<>(headers),
            new ParameterizedTypeReference<Map<String, Object>>() {});
        Map<String, Object> body = resp.getBody();
        if (body == null || !Boolean.TRUE.equals(body.get("ok"))) {
            throw slackRefusal(body == null ? "no_response" : str(body.get("error")));
        }
        if (!(body.get("messages") instanceof List<?> list)) return List.of();
        List<SlackHistoryMessage> out = new java.util.ArrayList<>();
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m) || m.get("subtype") != null) continue;
            String ts = str(m.get("ts"));
            String text = str(m.get("text"));
            if (ts == null || text == null || text.isBlank()) continue;
            out.add(new SlackHistoryMessage(ts, str(m.get("user")), text));
        }
        java.util.Collections.reverse(out); // Slack renvoie du plus récent au plus ancien
        return out;
    }

    /** Résout le nom affiché d'un utilisateur Slack (users.info), avec cache et fallback sur l'id. */
    @SuppressWarnings("unchecked")
    public String resolveUserName(Long workspaceId, String slackUserId) {
        if (slackUserId == null || slackUserId.isBlank()) return "Slack";
        String cacheKey = workspaceId + ":" + slackUserId;
        String cached = slackUserNameCache.get(cacheKey);
        if (cached != null) return cached;
        String name = slackUserId;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(requireToken(workspaceId));
            ResponseEntity<Map<String, Object>> resp = restTemplate.exchange(
                "https://slack.com/api/users.info?user=" + slackUserId, HttpMethod.GET,
                new HttpEntity<>(headers), new ParameterizedTypeReference<Map<String, Object>>() {});
            Map<String, Object> body = resp.getBody();
            if (body != null && Boolean.TRUE.equals(body.get("ok")) && body.get("user") instanceof Map<?, ?> u) {
                String display = u.get("profile") instanceof Map<?, ?> p ? str(p.get("display_name")) : null;
                String real = str(u.get("real_name"));
                if (display != null && !display.isBlank()) name = display;
                else if (real != null && !real.isBlank()) name = real;
            }
        } catch (Exception e) {
            log.warn("Résolution du nom Slack {} échouée: {}", slackUserId, e.getMessage());
        }
        slackUserNameCache.put(cacheKey, name);
        return name;
    }

    /**
     * Synchronise l'historique d'un canal Slack vers le Brain OS.
     *
     * <p>Recycle les lecteurs {@link #fetchHistory}/{@link #resolveUserName} : chaque message devient
     * un node de connaissance dedupe par {@code metadata.externalId} (= {@code canal:ts}) puis embedde.
     * Lecture seule cote Slack. Meme patron que {@link PlaneIntegrationService#sync}. On ecarte le bruit
     * ultra-court ; la deduplication rend l'operation idempotente (re-sync = seuls les nouveaux messages).
     */
    @Transactional
    public SlackSyncResponse sync(String workspaceSlug, Long userId, String slackChannelId) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        Long workspaceId = workspace.getId();
        String channelName = resolveChannelName(workspaceId, slackChannelId);

        List<SlackHistoryMessage> messages = fetchHistory(workspaceId, slackChannelId, null);
        Map<String, Long> existing = existingSlackNodes(workspaceId);
        int created = 0, updated = 0;
        for (SlackHistoryMessage msg : messages) {
            if (msg.text() == null || msg.text().strip().length() < MIN_MESSAGE_LEN) continue;
            String externalId = slackChannelId + ":" + msg.ts();
            String author = resolveUserName(workspaceId, msg.userId());
            String title = truncate("[Slack] " + author + " · " + snippet(msg.text()), 300);
            String content = buildMessageContent(channelName, author, msg);
            Map<String, Object> metadata = messageMetadata(slackChannelId, channelName, msg, author);

            Long nodeId = existing.get(externalId);
            if (nodeId != null) {
                KnowledgeNode node = nodeRepository.findById(nodeId).orElse(null);
                if (node != null) {
                    node.setTitle(title);
                    node.setContent(content);
                    node.setMetadata(metadata);
                    node.setUpdatedBy(String.valueOf(userId));
                    nodeRepository.save(node);
                    brainSearch.markForReindex(node.getId());
                    updated++;
                }
            } else {
                CreateKnowledgeNodeRequest req = CreateKnowledgeNodeRequest.builder()
                    .type("NOTE")
                    .domain("HISTORIQUE")
                    .title(title)
                    .content(content)
                    .tags(List.of("slack", "external"))
                    .metadata(metadata)
                    .build();
                knowledgeService.createNode(workspaceSlug, userId, req); // embed + link-sync inclus
                created++;
            }
        }
        log.info("Sync Slack workspace {} canal {} : {} crees, {} MAJ ({} messages)",
            workspaceId, slackChannelId, created, updated, messages.size());
        return new SlackSyncResponse(created, updated, messages.size());
    }

    /** Nom lisible du canal si configure (table slack_channels), sinon l'id Slack brut. */
    private String resolveChannelName(Long workspaceId, String slackChannelId) {
        return slackChannelRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream()
            .filter(c -> slackChannelId.equals(c.getChannelId()))
            .map(SlackChannel::getChannelName)
            .findFirst()
            .orElse(slackChannelId);
    }

    private Map<String, Long> existingSlackNodes(Long workspaceId) {
        Map<String, Long> map = new HashMap<>();
        jdbcTemplate.query(
            "SELECT id, metadata->>'externalId' AS ext FROM knowledge_nodes "
            + "WHERE workspace_id = ? AND metadata->>'source' = ?",
            rs -> { map.put(rs.getString("ext"), rs.getLong("id")); },
            workspaceId, SOURCE);
        return map;
    }

    private String buildMessageContent(String channelName, String author, SlackHistoryMessage msg) {
        return truncate(msg.text().strip(), MAX_BODY)
            + "\n\n> Slack · #" + channelName + " · " + author;
    }

    private Map<String, Object> messageMetadata(
        String slackChannelId, String channelName, SlackHistoryMessage msg, String author) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("source", SOURCE);
        m.put("externalId", slackChannelId + ":" + msg.ts());
        m.put("channelId", slackChannelId);
        m.put("channelName", channelName);
        m.put("ts", msg.ts());
        if (author != null) m.put("author", author);
        return m;
    }

    /** Extrait court (une ligne) pour le titre du node. */
    private String snippet(String text) {
        String flat = text.strip().replaceAll("\\s+", " ");
        return flat.length() > 80 ? flat.substring(0, 80) + "..." : flat;
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) : s;
    }

    private static String requireChannelId(String value) {
        String id = value == null ? "" : value.trim();
        if (!CHANNEL_ID.matcher(id).matches()) {
            throw new BusinessException("Invalid Slack channel ID (it looks like C0123456789)");
        }
        return id;
    }

    /** Refus de Slack à la lecture d'un canal, traduit en action à faire. */
    static BusinessException slackRefusal(String error) {
        return switch (error == null ? "" : error) {
            case "missing_scope" -> new BusinessException(
                "Slack doesn't let TaskForce read this channel yet: reconnect Slack to grant it");
            case "not_in_channel" -> new BusinessException(
                "Add the TaskForce app to this channel in Slack, then sync again");
            case "channel_not_found" -> new BusinessException("Slack channel not found");
            case "invalid_auth", "token_revoked", "account_inactive" -> new BusinessException(
                "Slack refused the workspace connection: reconnect Slack in Settings > Integrations");
            default -> new BusinessException("Slack refused to read the channel (" + error + ")");
        };
    }

    private String requireToken(Long workspaceId) {
        return integrationRepository.findByWorkspaceIdAndProvider(workspaceId, IntegrationProvider.SLACK)
            .map(Integration::getAccessToken)
            .orElseThrow(() -> new BusinessException("Slack isn't connected for this workspace"));
    }

    private String str(Object o) {
        return o != null ? String.valueOf(o) : null;
    }

    /** Un canal reçoit l'événement si sa liste de types le contient, ou si elle est vide (wildcard). */
    private boolean matchesEvent(String[] eventTypes, String eventType) {
        if (eventTypes == null || eventTypes.length == 0) return true;
        return Arrays.asList(eventTypes).contains(eventType);
    }

    /** POST chat.postMessage (best-effort — n'interrompt jamais l'appelant). */
    private void postMessage(String botToken, String channelId, String text) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(botToken);
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> request =
                new HttpEntity<>(Map.of("channel", channelId, "text", text), headers);
            restTemplate.postForObject("https://slack.com/api/chat.postMessage", request, Map.class);
        } catch (Exception e) {
            log.warn("Échec de notification Slack (canal {}): {}", channelId, e.getMessage());
        }
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private Map<String, Object> exchangeCodeForToken(String code) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("client_id",     clientId);
        body.add("client_secret", clientSecret);
        body.add("code",          code);

        HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(body, headers);
        ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
            SLACK_TOKEN_URL,
            HttpMethod.POST,
            request,
            new ParameterizedTypeReference<Map<String, Object>>() {}
        );

        Map<String, Object> responseBody = response.getBody();
        if (responseBody == null || Boolean.FALSE.equals(responseBody.get("ok"))) {
            throw new BusinessException("Slack didn't return an access token: " +
                (responseBody != null ? responseBody.get("error") : "null response"));
        }
        return responseBody;
    }

    @SuppressWarnings("unchecked")
    private String extractPath(Map<String, Object> map, String path) {
        String[] parts = path.split("\\.");
        Object current = map;
        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
            } else {
                return "";
            }
        }
        return current != null ? String.valueOf(current) : "";
    }

    private SlackChannelResponse toResponse(SlackChannel c) {
        return new SlackChannelResponse(
            c.getId(),
            c.getChannelId(),
            c.getChannelName(),
            c.getEventTypes() != null ? Arrays.asList(c.getEventTypes()) : List.of(),
            Boolean.TRUE.equals(c.getActive()),
            c.getCreatedAt()
        );
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
