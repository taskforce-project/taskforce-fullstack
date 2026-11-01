package com.taskforce.e16.emul.java.util;

/** E16 : {@code java.util.HexFormat} pour TeaVM, réduit à ce qu'utilise l'empreinte : {@code of().formatHex(bytes)}. */
public final class THexFormat {

    private static final THexFormat LOWER = new THexFormat();
    private static final char[] DIGITS = { '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f' };

    private THexFormat() {
    }

    public static THexFormat of() {
        return LOWER;
    }

    public String formatHex(byte[] bytes) {
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            out[i * 2] = DIGITS[(bytes[i] >> 4) & 0xf];
            out[i * 2 + 1] = DIGITS[bytes[i] & 0xf];
        }
        return new String(out);
    }
}
