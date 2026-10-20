package com.taskforce.tf_api.core.service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.DesktopAuthorizeRequest;
import com.taskforce.tf_api.core.dto.request.DesktopTokenRequest;
import com.taskforce.tf_api.core.dto.response.DesktopAccountResponse;
import com.taskforce.tf_api.core.dto.response.DesktopProfileResponse;
import com.taskforce.tf_api.core.dto.response.DesktopSessionInfoResponse;
import com.taskforce.tf_api.core.dto.response.DesktopSessionResponse;
import com.taskforce.tf_api.core.model.DesktopSession;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.DesktopSessionRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.extern.slf4j.Slf4j;

/**
 * Connexion de l'app desktop par la webapp, comme une app installée (RFC 8252) mais sans écran Keycloak : l'app ouvre
 * la page {@code /auth/desktop} de la webapp dans le navigateur avec un défi PKCE ; la personne s'y connecte comme
 * d'habitude (mot de passe et double authentification, GitHub, Google, passkey) puis accepte ; la webapp demande ici un
 * code d'autorisation et renvoie le navigateur vers l'app, sur 127.0.0.1 ; l'app échange le code et son vérificateur
 * contre une session.
 *
 * <p>La session est un jeton {@value #PREFIX} de 256 bits, gardé chiffré par l'app ; seule son empreinte SHA-256 est
 * stockée. Elle sert à relire le compte au lancement de l'app, se prolonge à chaque usage ({@link #SESSION_TTL}) et se
 * révoque à la déconnexion de l'app ou depuis les réglages de la webapp.</p>
 *
 * <p>Les codes vivent deux minutes, en mémoire, et ne servent qu'une fois : l'API tourne sur une seule instance (comme
 * les autres défis de connexion). À porter en base si elle passe à plusieurs instances.</p>
 */
@Service
@Profile("!desktop")
@Slf4j
public class DesktopSessionService {

    public static final String PREFIX = "tfa_";

    static final Duration CODE_TTL = Duration.ofMinutes(2);
    static final Duration SESSION_TTL = Duration.ofDays(90);
    static final Duration TOUCH_INTERVAL = Duration.ofHours(1);
    static final int MAX_ACTIVE_SESSIONS = 20;
    static final String DEFAULT_NAME = "TaskForce Desktop";

    /** Ports de retour de l'app desktop ({@code desktop/src/account.ts}), et rien d'autre. */
    static final Set<Integer> CALLBACK_PORTS = Set.of(47812, 47813, 47814, 47815);

    private static final Pattern REDIRECT = Pattern.compile("^http://127\\.0\\.0\\.1:(\\d{5})/callback$");
    private static final Pattern CHALLENGE = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final Pattern VERIFIER = Pattern.compile("^[A-Za-z0-9._~-]{43,128}$");
    private static final Pattern STATE = Pattern.compile("^[A-Za-z0-9_-]{8,128}$");
    private static final Pattern CODE = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final Pattern TOKEN = Pattern.compile("^" + PREFIX + "[A-Za-z0-9_-]{43}$");

    private final DesktopSessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final KeycloakService keycloakService;
    private final DesktopProfileReader profileReader;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, PendingCode> pendingCodes = new ConcurrentHashMap<>();

    record PendingCode(Long userId, String codeChallenge, String redirectUri, Instant expiresAt) {}

    @Autowired
    public DesktopSessionService(DesktopSessionRepository sessionRepository, UserRepository userRepository,
                                 KeycloakService keycloakService, DesktopProfileReader profileReader) {
        this(sessionRepository, userRepository, keycloakService, profileReader, Clock.systemDefaultZone());
    }

    DesktopSessionService(DesktopSessionRepository sessionRepository, UserRepository userRepository,
                          KeycloakService keycloakService, DesktopProfileReader profileReader, Clock clock) {
        this.sessionRepository = sessionRepository;
        this.userRepository = userRepository;
        this.keycloakService = keycloakService;
        this.profileReader = profileReader;
        this.clock = clock;
    }

    /**
     * Accord de la personne connectée dans la webapp : un code d'autorisation lié à son défi PKCE et à l'adresse de
     * retour de l'app. Rend l'adresse vers laquelle la webapp renvoie le navigateur.
     */
    public String authorize(Long userId, DesktopAuthorizeRequest request) {
        String redirectUri = requireRedirectUri(request.redirectUri());
        if (!CHALLENGE.matcher(request.codeChallenge()).matches()) {
            throw new BusinessException("Invalid sign-in request: start again from the app");
        }
        if (!STATE.matcher(request.state()).matches()) {
            throw new BusinessException("Invalid sign-in request: start again from the app");
        }
        activeUser(userId);
        Instant now = clock.instant();
        pendingCodes.values().removeIf(pending -> !now.isBefore(pending.expiresAt()));
        String code = newSecret();
        pendingCodes.put(sha256(code), new PendingCode(userId, request.codeChallenge(), redirectUri, now.plus(CODE_TTL)));
        log.info("Connexion de l'app desktop accordée par l'utilisateur {}", userId);
        return redirectUri + "?code=" + encode(code) + "&state=" + encode(request.state());
    }

    /**
     * Le code reçu par l'app et son vérificateur contre une session. Le code ne sert qu'une fois, même en cas d'échec.
     */
    @Transactional
    public DesktopSessionResponse exchange(DesktopTokenRequest request) {
        if (!CODE.matcher(request.code()).matches() || !VERIFIER.matcher(request.codeVerifier()).matches()) {
            throw new BusinessException("The sign-in expired or is invalid: start again from the app");
        }
        PendingCode pending = pendingCodes.remove(sha256(request.code()));
        if (pending == null || !clock.instant().isBefore(pending.expiresAt())
            || !pending.redirectUri().equals(request.redirectUri())
            || !MessageDigest.isEqual(
                pending.codeChallenge().getBytes(StandardCharsets.US_ASCII),
                s256(request.codeVerifier()).getBytes(StandardCharsets.US_ASCII))) {
            throw new BusinessException("The sign-in expired or is invalid: start again from the app");
        }
        User user = activeUser(pending.userId());
        LocalDateTime now = LocalDateTime.now(clock);
        retireOldestBeyondLimit(user.getId(), now);
        String value = PREFIX + newSecret();
        DesktopSession session = sessionRepository.save(DesktopSession.builder()
            .user(user)
            .name(deviceName(request.deviceName()))
            .tokenHash(sha256(value))
            .expiresAt(now.plus(SESSION_TTL))
            .lastUsedAt(now)
            .build());
        log.info("Session de l'app desktop {} ouverte pour l'utilisateur {}", session.getId(), user.getId());
        return new DesktopSessionResponse(value, session.getExpiresAt(), account(user));
    }

    /**
     * Le compte d'une session encore valable, qui se prolonge. Vide si le jeton est inconnu, révoqué, expiré, ou si le
     * compte est désactivé : l'app demande alors de se reconnecter.
     */
    @Transactional
    public Optional<DesktopSessionResponse> refresh(String token) {
        Optional<DesktopSession> found = valid(token);
        found.ifPresent(session -> {
            LocalDateTime now = LocalDateTime.now(clock);
            if (session.getLastUsedAt() == null || session.getLastUsedAt().isBefore(now.minus(TOUCH_INTERVAL))) {
                session.setLastUsedAt(now);
                session.setExpiresAt(now.plus(SESSION_TTL));
                sessionRepository.save(session);
            }
        });
        return found.map(session -> new DesktopSessionResponse(null, session.getExpiresAt(), account(session.getUser())));
    }

    /** Ferme la session de ce jeton ; sans effet s'il est inconnu ou déjà fermé. */
    @Transactional
    public void revoke(String token) {
        if (token == null || !TOKEN.matcher(token).matches()) {
            return;
        }
        sessionRepository.findByTokenHashWithUser(sha256(token))
            .filter(session -> session.getRevokedAt() == null)
            .ifPresent(session -> {
                session.setRevokedAt(LocalDateTime.now(clock));
                sessionRepository.save(session);
                log.info("Session de l'app desktop {} fermée par l'app", session.getId());
            });
    }

    @Transactional(readOnly = true)
    public List<DesktopSessionInfoResponse> list(Long userId) {
        LocalDateTime now = LocalDateTime.now(clock);
        return sessionRepository.findByUserIdAndRevokedAtIsNullOrderByCreatedAtDesc(userId).stream()
            .filter(session -> now.isBefore(session.getExpiresAt()))
            .map(session -> new DesktopSessionInfoResponse(session.getId(), session.getName(), session.getCreatedAt(),
                session.getLastUsedAt(), session.getExpiresAt()))
            .toList();
    }

    /** Ferme une session depuis les réglages de la webapp : l'app demandera de se reconnecter à son prochain lancement. */
    @Transactional
    public void revoke(Long userId, Long sessionId) {
        DesktopSession session = sessionRepository.findByIdAndUserIdAndRevokedAtIsNull(sessionId, userId)
            .orElseThrow(() -> new ResourceNotFoundException("Session not found"));
        session.setRevokedAt(LocalDateTime.now(clock));
        sessionRepository.save(session);
        log.info("Session de l'app desktop {} fermée par l'utilisateur {}", sessionId, userId);
    }

    private Optional<DesktopSession> valid(String token) {
        if (token == null || !TOKEN.matcher(token).matches()) {
            return Optional.empty();
        }
        LocalDateTime now = LocalDateTime.now(clock);
        return sessionRepository.findByTokenHashWithUser(sha256(token))
            .filter(session -> session.getRevokedAt() == null)
            .filter(session -> now.isBefore(session.getExpiresAt()))
            .filter(session -> Boolean.TRUE.equals(session.getUser().getIsActive()));
    }

    /** Au-delà de {@link #MAX_ACTIVE_SESSIONS}, la session la moins récemment utilisée se ferme : une réinstallation ne bloque jamais. */
    private void retireOldestBeyondLimit(Long userId, LocalDateTime now) {
        List<DesktopSession> active = sessionRepository.findByUserIdAndRevokedAtIsNullOrderByCreatedAtDesc(userId);
        if (active.size() < MAX_ACTIVE_SESSIONS) {
            return;
        }
        active.stream()
            .min(Comparator.comparing(s -> s.getLastUsedAt() == null ? s.getCreatedAt() : s.getLastUsedAt(),
                Comparator.nullsFirst(Comparator.naturalOrder())))
            .ifPresent(oldest -> {
                oldest.setRevokedAt(now);
                sessionRepository.save(oldest);
            });
    }

    private User activeUser(Long userId) {
        return userRepository.findById(userId)
            .filter(user -> Boolean.TRUE.equals(user.getIsActive()))
            .filter(user -> user.getKeycloakId() != null && user.getEmail() != null)
            .orElseThrow(() -> new BusinessException("This account can't sign in to the desktop app"));
    }

    /** Le nom vit chez Keycloak (pas dans {@code users}) ; sans lui, l'app garde l'adresse seule. */
    private DesktopAccountResponse account(User user) {
        String given = "";
        String family = "";
        try {
            UserRepresentation kc = keycloakService.getUserById(user.getKeycloakId());
            given = kc.getFirstName() == null ? "" : kc.getFirstName();
            family = kc.getLastName() == null ? "" : kc.getLastName();
        } catch (RuntimeException e) {
            log.warn("Nom du compte {} illisible pour l'app desktop : {}", user.getId(), e.getMessage());
        }
        return new DesktopAccountResponse(user.getKeycloakId(), user.getEmail(), given, family, profile(user));
    }

    /** Réglages du compte repris par l'app ; illisibles, l'app se connecte quand même et fait son onboarding. */
    private DesktopProfileResponse profile(User user) {
        try {
            return profileReader.read(user);
        } catch (RuntimeException e) {
            log.warn("Réglages du compte {} illisibles pour l'app desktop : {}", user.getId(), e.getMessage());
            return null;
        }
    }

    static String requireRedirectUri(String redirectUri) {
        Matcher matcher = REDIRECT.matcher(redirectUri == null ? "" : redirectUri);
        if (!matcher.matches() || !CALLBACK_PORTS.contains(Integer.parseInt(matcher.group(1)))) {
            throw new BusinessException("Invalid sign-in request: start again from the app");
        }
        return redirectUri;
    }

    static String deviceName(String requested) {
        String name = requested == null ? "" : requested.replaceAll("[\\p{Cntrl}]", "").strip();
        if (name.isEmpty()) {
            return DEFAULT_NAME;
        }
        return name.length() > 80 ? name.substring(0, 80) : name;
    }

    /** {@code BASE64URL(SHA-256(vérificateur))} : le défi PKCE S256 (RFC 7636 §4.2). */
    static String s256(String verifier) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest(verifier));
    }

    static String sha256(String value) {
        return HexFormat.of().formatHex(digest(value));
    }

    private static byte[] digest(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private String newSecret() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
