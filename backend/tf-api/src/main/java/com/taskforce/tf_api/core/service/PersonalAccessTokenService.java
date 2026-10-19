package com.taskforce.tf_api.core.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreatePersonalAccessTokenRequest;
import com.taskforce.tf_api.core.dto.response.CreatedPersonalAccessTokenResponse;
import com.taskforce.tf_api.core.dto.response.PersonalAccessTokenResponse;
import com.taskforce.tf_api.core.model.PersonalAccessToken;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.PersonalAccessTokenRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.extern.slf4j.Slf4j;

/**
 * Jetons personnels (OSS-5.1) : création, liste, révocation, et authentification d'une requête qui en porte un.
 *
 * <p>Un jeton vaut {@value #PREFIX} suivi de 32 octets aléatoires (base64url). Seule son empreinte SHA-256 est
 * stockée : une fuite de la base ne donne aucun jeton utilisable. Un aléa de 256 bits rend un hachage lent
 * inutile, contrairement à un mot de passe.</p>
 *
 * <p>Ce que le jeton permet est borné ailleurs : {@code PersonalTokenScopeFilter} ne le laisse passer que sur le
 * serveur MCP de l'instance, où chaque outil applique les droits de la personne.</p>
 */
@Service
@Slf4j
public class PersonalAccessTokenService {

    public static final String PREFIX = "tfp_";

    /** Plafond de jetons actifs par personne : au-delà, c'est un oubli de nettoyage, pas un besoin. */
    static final int MAX_ACTIVE_TOKENS = 20;

    /** Le dernier usage n'est réécrit qu'au-delà de cet intervalle : pas une écriture par appel d'outil. */
    static final Duration TOUCH_INTERVAL = Duration.ofMinutes(5);

    private static final Pattern TOKEN_SHAPE = Pattern.compile("^" + PREFIX + "[A-Za-z0-9_-]{43}$");
    private static final int HINT_LENGTH = PREFIX.length() + 8;

    private final PersonalAccessTokenRepository tokenRepository;
    private final UserRepository userRepository;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    @Autowired
    public PersonalAccessTokenService(PersonalAccessTokenRepository tokenRepository, UserRepository userRepository) {
        this(tokenRepository, userRepository, Clock.systemDefaultZone());
    }

    PersonalAccessTokenService(PersonalAccessTokenRepository tokenRepository, UserRepository userRepository, Clock clock) {
        this.tokenRepository = tokenRepository;
        this.userRepository = userRepository;
        this.clock = clock;
    }

    /** Personne authentifiée par un jeton personnel. */
    public record TokenPrincipal(Long tokenId, Long userId, String email, String keycloakId) {}

    @Transactional
    public CreatedPersonalAccessTokenResponse create(Long userId, CreatePersonalAccessTokenRequest request) {
        User user = userRepository.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        if (tokenRepository.countByUserIdAndRevokedAtIsNull(userId) >= MAX_ACTIVE_TOKENS) {
            throw new BusinessException("You already have " + MAX_ACTIVE_TOKENS + " access tokens. Revoke one you no longer use first.");
        }
        String value = PREFIX + newSecret();
        LocalDateTime now = LocalDateTime.now(clock);
        PersonalAccessToken token = PersonalAccessToken.builder()
            .user(user)
            .name(request.name().strip())
            .tokenHash(sha256(value))
            .tokenHint(value.substring(0, HINT_LENGTH))
            .expiresAt(request.expiresInDays() == null ? null : now.plusDays(request.expiresInDays()))
            .build();
        token = tokenRepository.save(token);
        log.info("Personal access token {} created for user {}", token.getId(), userId);
        return new CreatedPersonalAccessTokenResponse(toResponse(token, now), value);
    }

    @Transactional(readOnly = true)
    public List<PersonalAccessTokenResponse> list(Long userId) {
        LocalDateTime now = LocalDateTime.now(clock);
        return tokenRepository.findByUserIdAndRevokedAtIsNullOrderByCreatedAtDesc(userId).stream()
            .map(token -> toResponse(token, now))
            .toList();
    }

    @Transactional
    public void revoke(Long userId, Long tokenId) {
        PersonalAccessToken token = tokenRepository.findByIdAndUserIdAndRevokedAtIsNull(tokenId, userId)
            .orElseThrow(() -> new ResourceNotFoundException("Access token not found"));
        token.setRevokedAt(LocalDateTime.now(clock));
        tokenRepository.save(token);
        log.info("Personal access token {} revoked by user {}", tokenId, userId);
    }

    /** Vrai si la valeur a la forme d'un jeton personnel (et non d'un JWT) : décide du chemin d'authentification. */
    public static boolean looksLikeToken(String value) {
        return value != null && value.startsWith(PREFIX);
    }

    /**
     * Personne au nom de laquelle agit ce jeton, ou vide s'il est inconnu, révoqué, expiré, ou si son compte est
     * désactivé. Tous ces cas rendent la même réponse : l'appelant ne doit pas savoir lequel a échoué.
     */
    @Transactional
    public Optional<TokenPrincipal> authenticate(String value) {
        if (value == null || !TOKEN_SHAPE.matcher(value).matches()) {
            return Optional.empty();
        }
        LocalDateTime now = LocalDateTime.now(clock);
        Optional<PersonalAccessToken> found = tokenRepository.findByTokenHashWithUser(sha256(value))
            .filter(token -> token.getRevokedAt() == null)
            .filter(token -> token.getExpiresAt() == null || now.isBefore(token.getExpiresAt()))
            .filter(token -> Boolean.TRUE.equals(token.getUser().getIsActive()))
            .filter(token -> token.getUser().getEmail() != null && !token.getUser().getEmail().isBlank());
        found.ifPresent(token -> {
            if (token.getLastUsedAt() == null || token.getLastUsedAt().isBefore(now.minus(TOUCH_INTERVAL))) {
                tokenRepository.touch(token.getId(), now);
            }
        });
        return found.map(token -> new TokenPrincipal(
            token.getId(), token.getUser().getId(), token.getUser().getEmail(), token.getUser().getKeycloakId()));
    }

    private PersonalAccessTokenResponse toResponse(PersonalAccessToken token, LocalDateTime now) {
        boolean expired = token.getExpiresAt() != null && !now.isBefore(token.getExpiresAt());
        return new PersonalAccessTokenResponse(token.getId(), token.getName(), token.getTokenHint(),
            token.getCreatedAt(), token.getLastUsedAt(), token.getExpiresAt(), expired);
    }

    private String newSecret() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
