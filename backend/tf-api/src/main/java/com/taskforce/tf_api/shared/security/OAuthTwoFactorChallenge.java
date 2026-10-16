package com.taskforce.tf_api.shared.security;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Défi de second facteur d'une connexion externe (GitHub, Google) : OSS-1.1.
 *
 * <p>Le code d'autorisation du fournisseur est à usage unique : une fois échangé, impossible de le
 * rejouer après la saisie du code TOTP. Quand le 2FA est actif, les jetons Keycloak déjà obtenus sont
 * donc <b>scellés</b> dans ce défi au lieu d'être rendus. Le navigateur le conserve et le renvoie avec
 * le code ; la session n'est délivrée qu'une fois le code vérifié.</p>
 *
 * <p>Le défi est chiffré (AES-256-GCM, données associées propres à cet usage) : le navigateur ne peut
 * ni lire les jetons qu'il contient, ni le modifier. Il expire après {@link #TTL}. La clé dérive de
 * {@code security.encryption-key} quand elle est posée (partagée entre instances) ; sinon elle est tirée
 * au démarrage, et un défi ne vaut que pour l'instance qui l'a émis.</p>
 */
@Component
public class OAuthTwoFactorChallenge {

    static final Duration TTL = Duration.ofMinutes(5);

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;
    private static final byte[] AAD = "tf-oauth-2fa-v1".getBytes(StandardCharsets.UTF_8);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final ObjectMapper JSON = new ObjectMapper();

    private final SecretKey key;
    private final Clock clock;

    /** Ce qu'un défi transporte : de quoi délivrer la session une fois le code vérifié. */
    public record Pending(
        Long userId,
        String accessToken,
        String refreshToken,
        Integer expiresIn,
        Integer refreshExpiresIn,
        String firstName,
        String lastName
    ) { }

    private record Sealed(Pending pending, long expiresAt) { }

    @Autowired
    public OAuthTwoFactorChallenge(@Value("${security.encryption-key:}") String encryptionKey) {
        this(deriveKey(encryptionKey), Clock.systemUTC());
    }

    OAuthTwoFactorChallenge(SecretKey key, Clock clock) {
        this.key = key;
        this.clock = clock;
    }

    static SecretKey deriveKey(String secret) {
        try {
            byte[] material;
            if (secret == null || secret.isBlank()) {
                material = new byte[32];
                RANDOM.nextBytes(material);
            } else {
                material = MessageDigest.getInstance("SHA-256")
                    .digest(("oauth-2fa:" + secret).getBytes(StandardCharsets.UTF_8));
            }
            return new SecretKeySpec(material, "AES");
        } catch (Exception ex) {
            throw new IllegalStateException("Clé du défi 2FA indisponible", ex);
        }
    }

    /** Scelle les jetons en attente du code. */
    public String seal(Pending pending) {
        try {
            byte[] clear = JSON.writeValueAsBytes(new Sealed(pending, clock.millis() + TTL.toMillis()));
            byte[] iv = new byte[IV_LENGTH];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(AAD);
            byte[] sealed = cipher.doFinal(clear);
            // Concaténation IV || chiffré sans calcul de longueur (alerte CodeQL java/uncontrolled-arithmetic).
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            out.writeBytes(iv);
            out.writeBytes(sealed);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(out.toByteArray());
        } catch (Exception ex) {
            throw new IllegalStateException("Échec du scellement du défi 2FA", ex);
        }
    }

    /**
     * Ouvre un défi. Message identique quelle que soit la cause (falsifié, illisible, expiré) :
     * détailler renseignerait un attaquant sur l'état de sa tentative.
     */
    public Pending open(String challenge) {
        Sealed sealed;
        try {
            byte[] raw = Base64.getUrlDecoder().decode(challenge);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, raw, 0, IV_LENGTH));
            cipher.updateAAD(AAD);
            byte[] clear = cipher.doFinal(raw, IV_LENGTH, raw.length - IV_LENGTH);
            sealed = JSON.readValue(clear, Sealed.class);
        } catch (Exception ex) {
            throw expired();
        }
        if (sealed.pending() == null || sealed.pending().userId() == null || sealed.expiresAt() < clock.millis()) {
            throw expired();
        }
        return sealed.pending();
    }

    private static BusinessException expired() {
        return new BusinessException("This sign-in has expired. Please sign in again.");
    }
}
