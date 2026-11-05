package com.taskforce.rules_engine_js.emul.java.security;

import java.security.NoSuchAlgorithmException;

/**
 * {@code java.security.MessageDigest} pour TeaVM, dont la bibliothèque n'en a pas : SHA-256 seulement (FIPS 180-4), en
 * Java pur, pour l'empreinte d'un paquet de règles et la chaîne du dossier de preuve ({@code EvidenceChain.sha256}).
 * Substitué par {@code JdkSubstitutions}, dans la seule compilation en JavaScript : le serveur garde le MessageDigest
 * du JDK. Les cas de contracts/ (empreinte du paquet, chaîne de référence) le vérifient contre celui du JDK.
 */
public class TMessageDigest {

    private static final int[] K = {
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    };

    private final String algorithm;
    private byte[] pending = new byte[0];

    protected TMessageDigest(String algorithm) {
        this.algorithm = algorithm;
    }

    public static TMessageDigest getInstance(String algorithm) throws NoSuchAlgorithmException {
        if (!"SHA-256".equalsIgnoreCase(algorithm)) {
            throw new NoSuchAlgorithmException(algorithm + " is not available in the JavaScript build");
        }
        return new TMessageDigest("SHA-256");
    }

    public final String getAlgorithm() {
        return algorithm;
    }

    public void update(byte[] input) {
        byte[] joined = new byte[pending.length + input.length];
        System.arraycopy(pending, 0, joined, 0, pending.length);
        System.arraycopy(input, 0, joined, pending.length, input.length);
        pending = joined;
    }

    public byte[] digest(byte[] input) {
        update(input);
        return digest();
    }

    public byte[] digest() {
        byte[] out = sha256(pending);
        pending = new byte[0];
        return out;
    }

    public void reset() {
        pending = new byte[0];
    }

    public static boolean isEqual(byte[] a, byte[] b) {
        if (a == b) {
            return true;
        }
        if (a == null || b == null || a.length != b.length) {
            return false;
        }
        int diff = 0;
        for (int i = 0; i < a.length; i++) {
            diff |= a[i] ^ b[i];
        }
        return diff == 0;
    }

    private static byte[] sha256(byte[] message) {
        int[] h = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };
        long bitLength = (long) message.length * 8;
        // Le message, l'octet 0x80, des zéros, puis sa longueur en bits sur 8 octets : un multiple de 64 octets.
        int padded = ((message.length + 9 + 63) / 64) * 64;
        byte[] data = new byte[padded];
        System.arraycopy(message, 0, data, 0, message.length);
        data[message.length] = (byte) 0x80;
        for (int i = 0; i < 8; i++) {
            data[padded - 1 - i] = (byte) (bitLength >>> (8 * i));
        }
        int[] w = new int[64];
        for (int block = 0; block < padded; block += 64) {
            for (int t = 0; t < 16; t++) {
                int j = block + t * 4;
                w[t] = ((data[j] & 0xff) << 24) | ((data[j + 1] & 0xff) << 16) | ((data[j + 2] & 0xff) << 8) | (data[j + 3] & 0xff);
            }
            for (int t = 16; t < 64; t++) {
                int s0 = Integer.rotateRight(w[t - 15], 7) ^ Integer.rotateRight(w[t - 15], 18) ^ (w[t - 15] >>> 3);
                int s1 = Integer.rotateRight(w[t - 2], 17) ^ Integer.rotateRight(w[t - 2], 19) ^ (w[t - 2] >>> 10);
                w[t] = w[t - 16] + s0 + w[t - 7] + s1;
            }
            int a = h[0];
            int b = h[1];
            int c = h[2];
            int d = h[3];
            int e = h[4];
            int f = h[5];
            int g = h[6];
            int k = h[7];
            for (int t = 0; t < 64; t++) {
                int s1 = Integer.rotateRight(e, 6) ^ Integer.rotateRight(e, 11) ^ Integer.rotateRight(e, 25);
                int ch = (e & f) ^ (~e & g);
                int temp1 = k + s1 + ch + K[t] + w[t];
                int s0 = Integer.rotateRight(a, 2) ^ Integer.rotateRight(a, 13) ^ Integer.rotateRight(a, 22);
                int maj = (a & b) ^ (a & c) ^ (b & c);
                int temp2 = s0 + maj;
                k = g;
                g = f;
                f = e;
                e = d + temp1;
                d = c;
                c = b;
                b = a;
                a = temp1 + temp2;
            }
            h[0] += a;
            h[1] += b;
            h[2] += c;
            h[3] += d;
            h[4] += e;
            h[5] += f;
            h[6] += g;
            h[7] += k;
        }
        byte[] out = new byte[32];
        for (int i = 0; i < 8; i++) {
            out[i * 4] = (byte) (h[i] >>> 24);
            out[i * 4 + 1] = (byte) (h[i] >>> 16);
            out[i * 4 + 2] = (byte) (h[i] >>> 8);
            out[i * 4 + 3] = (byte) h[i];
        }
        return out;
    }
}
