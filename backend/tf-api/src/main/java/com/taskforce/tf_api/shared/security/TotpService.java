package com.taskforce.tf_api.shared.security;

import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Service;

/**
 * TOTP (RFC 6238) « maison » — génération de secret, URI otpauth (QR), et vérification de code.
 *
 * <p>Aucune dépendance ajoutée : {@link Mac} (HmacSHA1) pour le HOTP/TOTP, Base32 (RFC 4648)
 * implémenté ici. Compatible Google Authenticator / Authy / 1Password (SHA1, 6 chiffres, 30 s).
 * Tolérance d'une fenêtre de part et d'autre ({@link #WINDOW}) pour absorber le décalage d'horloge.</p>
 */
@Service
public class TotpService {

    private static final int PERIOD = 30;   // secondes par fenêtre
    private static final int DIGITS = 6;
    private static final int WINDOW = 1;    // ± fenêtres tolérées
    private static final String ALGO = "HmacSHA1";
    private static final String B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final SecureRandom RNG = new SecureRandom();

    /** Secret aléatoire de 20 octets, encodé Base32. */
    public String generateSecret() {
        byte[] buf = new byte[20];
        RNG.nextBytes(buf);
        return base32Encode(buf);
    }

    /** URI {@code otpauth://totp/…} à encoder en QR (ou à saisir à la main). */
    public String buildUri(String secret, String account, String issuer) {
        String iss = enc(issuer);
        return "otpauth://totp/" + iss + ":" + enc(account)
            + "?secret=" + secret + "&issuer=" + iss
            + "&algorithm=SHA1&digits=" + DIGITS + "&period=" + PERIOD;
    }

    /** Vrai si {@code code} correspond au {@code secret} pour la fenêtre courante (± {@link #WINDOW}). */
    public boolean verify(String secret, String code) {
        if (secret == null || code == null) {
            return false;
        }
        String c = code.trim();
        if (c.length() != DIGITS || !c.chars().allMatch(Character::isDigit)) {
            return false;
        }
        long step = currentStep();
        for (int w = -WINDOW; w <= WINDOW; w++) {
            if (c.equals(generate(secret, step + w))) {
                return true;
            }
        }
        return false;
    }

    /** Code à {@link #DIGITS} chiffres pour une fenêtre donnée. Public pour les tests. */
    public String generate(String secret, long step) {
        byte[] key = base32Decode(secret);
        byte[] data = ByteBuffer.allocate(8).putLong(step).array();
        try {
            Mac mac = Mac.getInstance(ALGO);
            mac.init(new SecretKeySpec(key, ALGO));
            byte[] h = mac.doFinal(data);
            int off = h[h.length - 1] & 0x0f;
            int bin = ((h[off] & 0x7f) << 24)
                | ((h[off + 1] & 0xff) << 16)
                | ((h[off + 2] & 0xff) << 8)
                | (h[off + 3] & 0xff);
            int otp = bin % (int) Math.pow(10, DIGITS);
            return String.format("%0" + DIGITS + "d", otp);
        } catch (Exception e) {
            throw new IllegalStateException("Échec du calcul TOTP", e);
        }
    }

    public long currentStep() {
        return System.currentTimeMillis() / 1000L / PERIOD;
    }

    // ---- Base32 (RFC 4648, sans padding) -----------------------------------------------------

    private static String base32Encode(byte[] data) {
        StringBuilder sb = new StringBuilder();
        int buffer = 0;
        int bits = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xff);
            bits += 8;
            while (bits >= 5) {
                sb.append(B32.charAt((buffer >> (bits - 5)) & 0x1f));
                bits -= 5;
            }
        }
        if (bits > 0) {
            sb.append(B32.charAt((buffer << (5 - bits)) & 0x1f));
        }
        return sb.toString();
    }

    private static byte[] base32Decode(String s) {
        String in = s.trim().replace("=", "").toUpperCase();
        int buffer = 0;
        int bits = 0;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (int i = 0; i < in.length(); i++) {
            int v = B32.indexOf(in.charAt(i));
            if (v < 0) {
                continue;
            }
            buffer = (buffer << 5) | v;
            bits += 5;
            if (bits >= 8) {
                out.write((buffer >> (bits - 8)) & 0xff);
                bits -= 8;
            }
        }
        return out.toByteArray();
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
