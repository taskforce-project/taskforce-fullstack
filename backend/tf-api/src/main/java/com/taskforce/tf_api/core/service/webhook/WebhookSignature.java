package com.taskforce.tf_api.core.service.webhook;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Signature des envois de webhook (OSS-6.2). Le destinataire recalcule
 * {@code HMAC-SHA256(secret, timestamp + "." + corps)} avec le corps brut reçu et l'en-tête
 * {@code X-TaskForce-Timestamp}, puis compare à {@code X-TaskForce-Signature} (format {@code sha256=<hex>}).
 * Signer l'horodatage avec le corps permet au destinataire de refuser un envoi rejoué plus tard.
 */
public final class WebhookSignature {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String PREFIX = "whsec_";

    private WebhookSignature() {}

    /** Nouveau secret : {@code whsec_} suivi de 32 octets aléatoires en base64url. */
    public static String newSecret() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** Valeur de l'en-tête {@code X-TaskForce-Signature} pour ce corps et cet horodatage (secondes Unix). */
    public static String sign(String secret, long timestamp, String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal((timestamp + "." + body).getBytes(StandardCharsets.UTF_8));
            return "sha256=" + HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }
}
