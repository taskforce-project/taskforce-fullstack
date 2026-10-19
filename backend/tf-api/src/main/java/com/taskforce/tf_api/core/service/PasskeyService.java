package com.taskforce.tf_api.core.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.web.webauthn.api.AuthenticatorAssertionResponse;
import org.springframework.security.web.webauthn.api.AuthenticatorAttestationResponse;
import org.springframework.security.web.webauthn.api.Bytes;
import org.springframework.security.web.webauthn.api.CredentialRecord;
import org.springframework.security.web.webauthn.api.PublicKeyCredential;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialCreationOptions;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialRequestOptions;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.jackson.WebauthnJacksonModule;
import org.springframework.security.web.webauthn.management.ImmutablePublicKeyCredentialCreationOptionsRequest;
import org.springframework.security.web.webauthn.management.ImmutablePublicKeyCredentialRequestOptionsRequest;
import org.springframework.security.web.webauthn.management.ImmutableRelyingPartyRegistrationRequest;
import org.springframework.security.web.webauthn.management.RelyingPartyAuthenticationRequest;
import org.springframework.security.web.webauthn.management.RelyingPartyPublicKey;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.PasskeyResponse;
import com.taskforce.tf_api.core.dto.response.PasskeySignInOptionsResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Passkeys de la webapp (Windows Hello, Touch ID, téléphone, clé de sécurité) : en ajouter une depuis les réglages, s'en
 * servir pour se connecter sans mot de passe ni code. Les cérémonies WebAuthn (défi, origine, signature, compteur) sont
 * vérifiées par Spring Security au-dessus de webauthn4j ({@code PasskeyConfig}) ; ce service garde les défis en cours
 * et rattache une passkey à un compte TaskForce.
 *
 * <p>Les défis vivent cinq minutes, en mémoire, et ne servent qu'une fois (une instance de backend, comme les autres
 * défis de connexion).</p>
 */
@Service
@Profile("!desktop")
@Slf4j
public class PasskeyService {

    static final Duration CEREMONY_TTL = Duration.ofMinutes(5);
    static final int MAX_PASSKEYS = 20;
    /** Défis de connexion en cours, tous visiteurs confondus : la route est publique, sa mémoire reste bornée. */
    static final int MAX_PENDING_SIGN_INS = 10_000;
    static final String DEFAULT_LABEL = "Passkey";

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};
    private static final TypeReference<PublicKeyCredential<AuthenticatorAttestationResponse>> ATTESTATION = new TypeReference<>() {};
    private static final TypeReference<PublicKeyCredential<AuthenticatorAssertionResponse>> ASSERTION = new TypeReference<>() {};

    private final WebAuthnRelyingPartyOperations relyingParty;
    private final UserCredentialRepository credentials;
    private final UserRepository userRepository;
    private final AuthService authService;
    private final Clock clock;
    private final JsonMapper webauthnJson = JsonMapper.builder().addModule(new WebauthnJacksonModule()).build();
    private final SecureRandom random = new SecureRandom();

    private final Map<Long, Pending<PublicKeyCredentialCreationOptions>> registrations = new ConcurrentHashMap<>();
    private final Map<String, Pending<PublicKeyCredentialRequestOptions>> signIns = new ConcurrentHashMap<>();

    record Pending<T>(T options, Instant expiresAt) {}

    @Autowired
    public PasskeyService(WebAuthnRelyingPartyOperations relyingParty, UserCredentialRepository credentials,
                          UserRepository userRepository, AuthService authService) {
        this(relyingParty, credentials, userRepository, authService, Clock.systemUTC());
    }

    PasskeyService(WebAuthnRelyingPartyOperations relyingParty, UserCredentialRepository credentials,
                   UserRepository userRepository, AuthService authService, Clock clock) {
        this.relyingParty = relyingParty;
        this.credentials = credentials;
        this.userRepository = userRepository;
        this.authService = authService;
        this.clock = clock;
    }

    /** Options de création d'une passkey pour la personne connectée, à passer au navigateur. */
    @Transactional
    public Map<String, Object> registrationOptions(Long userId) {
        User user = activeUser(userId);
        if (passkeysOf(user).size() >= MAX_PASSKEYS) {
            throw new BusinessException("You already have " + MAX_PASSKEYS + " passkeys. Remove one you no longer use first.");
        }
        PublicKeyCredentialCreationOptions options = relyingParty.createPublicKeyCredentialCreationOptions(
            new ImmutablePublicKeyCredentialCreationOptionsRequest(
                UsernamePasswordAuthenticationToken.authenticated(user.getEmail(), null, List.of())));
        purgeExpired();
        registrations.put(userId, new Pending<>(options, clock.instant().plus(CEREMONY_TTL)));
        return webauthnJson.convertValue(options, MAP);
    }

    /** Enregistre la passkey créée par le navigateur pour le défi en cours de cette personne. */
    @Transactional
    public PasskeyResponse register(Long userId, String label, Map<String, Object> credential) {
        Pending<PublicKeyCredentialCreationOptions> pending = registrations.remove(userId);
        if (pending == null || !clock.instant().isBefore(pending.expiresAt())) {
            throw new BusinessException("Adding the passkey took too long. Try again.");
        }
        activeUser(userId);
        PublicKeyCredential<AuthenticatorAttestationResponse> created = read(credential, ATTESTATION);
        CredentialRecord record;
        try {
            record = relyingParty.registerCredential(new ImmutableRelyingPartyRegistrationRequest(
                pending.options(), new RelyingPartyPublicKey(created, label(label))));
        } catch (RuntimeException e) {
            log.warn("Passkey refusée pour l'utilisateur {} : {}", userId, e.getMessage());
            throw new BusinessException("This passkey couldn't be added. Try again.");
        }
        log.info("Passkey ajoutée pour l'utilisateur {}", userId);
        return toResponse(record);
    }

    @Transactional(readOnly = true)
    public List<PasskeyResponse> list(Long userId) {
        return passkeysOf(activeUser(userId)).stream()
            .sorted(Comparator.comparing(CredentialRecord::getCreated, Comparator.nullsLast(Comparator.reverseOrder())))
            .map(PasskeyService::toResponse)
            .toList();
    }

    /** Retire une passkey du compte : elle ne permet plus de se connecter, même si l'appareil la garde. */
    @Transactional
    public void delete(Long userId, String passkeyId) {
        User user = activeUser(userId);
        CredentialRecord record = passkeyId == null || passkeyId.isBlank()
            ? null
            : credentials.findByCredentialId(Bytes.fromBase64(passkeyId));
        if (record == null || user.getPasskeyHandle() == null
            || !Objects.equals(record.getUserEntityUserId().toBase64UrlString(), user.getPasskeyHandle())) {
            throw new ResourceNotFoundException("Passkey not found");
        }
        credentials.delete(record.getCredentialId());
        log.info("Passkey retirée par l'utilisateur {}", userId);
    }

    /** Défi de connexion, sans connaître la personne : le navigateur propose les passkeys qu'il a pour ce site. */
    public PasskeySignInOptionsResponse signInOptions() {
        purgeExpired();
        if (signIns.size() >= MAX_PENDING_SIGN_INS) {
            throw new BusinessException("Too many passkey sign-ins are in progress. Try again in a minute.");
        }
        PublicKeyCredentialRequestOptions options = relyingParty.createCredentialRequestOptions(
            new ImmutablePublicKeyCredentialRequestOptionsRequest(null));
        String requestId = newId();
        signIns.put(requestId, new Pending<>(options, clock.instant().plus(CEREMONY_TTL)));
        return new PasskeySignInOptionsResponse(requestId, webauthnJson.convertValue(options, MAP));
    }

    /** Vérifie la réponse du navigateur au défi, puis ouvre la session du compte de cette passkey. */
    public AuthResponse signIn(String requestId, Map<String, Object> credential) {
        Pending<PublicKeyCredentialRequestOptions> pending = requestId == null ? null : signIns.remove(requestId);
        if (pending == null || !clock.instant().isBefore(pending.expiresAt())) {
            throw new BusinessException("The passkey sign-in took too long. Try again.");
        }
        PublicKeyCredential<AuthenticatorAssertionResponse> assertion = read(credential, ASSERTION);
        PublicKeyCredentialUserEntity entity;
        try {
            entity = relyingParty.authenticate(new RelyingPartyAuthenticationRequest(pending.options(), assertion));
        } catch (RuntimeException e) {
            log.warn("Connexion par passkey refusée : {}", e.getMessage());
            throw new BusinessException("This passkey couldn't sign you in. Use your password, or another passkey.");
        }
        User user = userRepository.findByPasskeyHandle(entity.getId().toBase64UrlString())
            .orElseThrow(() -> new BusinessException("This passkey couldn't sign you in. Use your password, or another passkey."));
        return authService.completePasskeyLogin(user.getId());
    }

    private List<CredentialRecord> passkeysOf(User user) {
        if (user.getPasskeyHandle() == null) {
            return List.of();
        }
        return credentials.findByUserId(Bytes.fromBase64(user.getPasskeyHandle()));
    }

    private User activeUser(Long userId) {
        return userRepository.findById(userId)
            .filter(user -> Boolean.TRUE.equals(user.getIsActive()))
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

    private <T> T read(Map<String, Object> credential, TypeReference<T> type) {
        try {
            return webauthnJson.convertValue(credential, type);
        } catch (RuntimeException e) {
            throw new BusinessException("The passkey answer couldn't be read. Try again.");
        }
    }

    private void purgeExpired() {
        Instant now = clock.instant();
        registrations.values().removeIf(pending -> !now.isBefore(pending.expiresAt()));
        signIns.values().removeIf(pending -> !now.isBefore(pending.expiresAt()));
    }

    static String label(String requested) {
        String label = requested == null ? "" : requested.replaceAll("[\\p{Cntrl}]", "").strip();
        if (label.isEmpty()) {
            return DEFAULT_LABEL;
        }
        return label.length() > 80 ? label.substring(0, 80) : label;
    }

    static PasskeyResponse toResponse(CredentialRecord record) {
        return new PasskeyResponse(record.getCredentialId().toBase64UrlString(), record.getLabel(),
            utc(record.getCreated()), utc(record.getLastUsed()));
    }

    private static LocalDateTime utc(Instant instant) {
        return instant == null ? null : LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private String newId() {
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
