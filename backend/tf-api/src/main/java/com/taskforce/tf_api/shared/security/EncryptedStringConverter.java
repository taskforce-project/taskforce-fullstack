package com.taskforce.tf_api.shared.security;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Chiffrement au repos AES-256-GCM pour colonnes String sensibles (RGPD C11.2).
 *
 * <p>À poser via {@code @Convert(converter = EncryptedStringConverter.class)} sur des champs PII
 * <b>non utilisés dans des requêtes par valeur</b> et stockés en <b>TEXT</b> (le chiffré est plus
 * long que le clair). À ne PAS appliquer à email/keycloakId/tokens (clés de recherche : GCM est
 * non déterministe → casserait les lookups ; nécessiterait un chiffrement déterministe / blind index).</p>
 *
 * <p>Format en base : {@code enc:base64(IV(12o) || ciphertext+tag)}. Lecture <b>tolérante</b> :
 * une valeur sans préfixe {@code enc:} (legacy clair) est renvoyée telle quelle → application
 * possible sur des colonnes déjà peuplées, le chiffrement s'applique aux écritures suivantes.</p>
 *
 * <p>La clé est injectée au démarrage par {@link EncryptionKeyHolder}. Sans clé configurée, le
 * convertisseur est un passe-plat (clair) — utile en dev non configuré.</p>
 */
@Converter
public class EncryptedStringConverter implements AttributeConverter<String, String> {

    private static final String PREFIX = "enc:";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private static volatile SecretKey key;

    /** Configure la clé (dérivée par SHA-256 du secret fourni → 256 bits). Vide = chiffrement désactivé. */
    public static void configure(String secret) {
        if (secret == null || secret.isBlank()) {
            key = null;
            return;
        }
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8));
            key = new SecretKeySpec(hash, "AES");
        } catch (Exception ex) {
            key = null;
        }
    }

    @Override
    public String convertToDatabaseColumn(String attribute) {
        if (attribute == null || key == null) {
            return attribute;
        }
        try {
            byte[] iv = new byte[IV_LENGTH];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(attribute.getBytes(StandardCharsets.UTF_8));
            byte[] combined = ByteBuffer.allocate(iv.length + ciphertext.length).put(iv).put(ciphertext).array();
            return PREFIX + Base64.getEncoder().encodeToString(combined);
        } catch (Exception ex) {
            throw new IllegalStateException("Échec du chiffrement au repos", ex);
        }
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        if (dbData == null || !dbData.startsWith(PREFIX) || key == null) {
            return dbData; // null, legacy clair, ou clé absente → tel quel
        }
        try {
            byte[] combined = Base64.getDecoder().decode(dbData.substring(PREFIX.length()));
            ByteBuffer buffer = ByteBuffer.wrap(combined);
            byte[] iv = new byte[IV_LENGTH];
            buffer.get(iv);
            byte[] ciphertext = new byte[buffer.remaining()];
            buffer.get(ciphertext);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception ex) {
            return dbData; // tolérant : ne casse pas la lecture si déchiffrement impossible
        }
    }
}
