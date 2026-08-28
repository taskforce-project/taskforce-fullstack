package com.taskforce.tf_api.shared.security;

import java.net.IDN;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;

/**
 * Garde anti-SSRF pour les URL fournies par l'utilisateur puis appelées côté serveur
 * (webhooks sortants). Rejette tout ce qui n'est pas un http(s) « public » :
 * <ul>
 *   <li>schémas exotiques (file:, gopher:, etc.) — seuls http/https passent ;</li>
 *   <li>hôtes qui résolvent vers une adresse de bouclage (127.0.0.0/8, ::1),
 *       privée (10/8, 172.16/12, 192.168/16), link-local (169.254/16 = métadonnées
 *       cloud), any-local (0.0.0.0), multicast ;</li>
 *   <li>CGNAT 100.64.0.0/10 — le réseau <b>Tailscale</b> des VM de prod ;</li>
 *   <li>IPv6 Unique Local Address (fc00::/7).</li>
 * </ul>
 * Le DNS est résolu et <b>chaque</b> adresse retournée est vérifiée → cela bloque aussi
 * les noms de service Docker internes (<code>postgres</code>, <code>keycloak</code>,
 * <code>minio</code>…), qui pointent vers du 172.16/12.
 *
 * <p>À appeler à la configuration (create/update, pour un rejet immédiat en 400) ET au
 * moment de l'envoi (défense en profondeur contre une entrée corrompue ou un rebinding DNS).
 */
public final class SsrfGuard {

    private SsrfGuard() {}

    /** Lève {@link IllegalArgumentException} (→ 400) si l'URL n'est pas un http(s) public. */
    public static void assertPublicHttpUrl(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("URL manquante");
        }
        final URI uri;
        try {
            uri = URI.create(raw.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("URL invalide");
        }
        final String scheme = uri.getScheme();
        if (scheme == null
                || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw new IllegalArgumentException("Seules les URL http(s) sont autorisées");
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException("Hôte de l'URL manquant ou invalide");
        }
        // Littéral IPv6 : retirer les crochets ([::1] → ::1) pour la résolution.
        if (host.startsWith("[") && host.endsWith("]") && host.length() > 2) {
            host = host.substring(1, host.length() - 1);
        }
        String asciiHost;
        try {
            asciiHost = IDN.toASCII(host); // nom de domaine → punycode ; IP littérale → inchangée
        } catch (RuntimeException e) {
            asciiHost = host;              // ex. IPv6 littéral que IDN refuse : on résout tel quel
        }
        final InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(asciiHost);
        } catch (UnknownHostException e) {
            throw new IllegalArgumentException("Hôte de l'URL introuvable");
        }
        for (InetAddress addr : addresses) {
            if (isBlocked(addr)) {
                throw new IllegalArgumentException("URL vers une adresse interne interdite (SSRF)");
            }
        }
    }

    /** {@code true} si l'URL est un http(s) public (ne lève jamais). */
    public static boolean isPublicHttpUrl(String raw) {
        try {
            assertPublicHttpUrl(raw);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static boolean isBlocked(InetAddress a) {
        if (a.isLoopbackAddress() || a.isAnyLocalAddress() || a.isLinkLocalAddress()
                || a.isSiteLocalAddress() || a.isMulticastAddress()) {
            return true;
        }
        final byte[] b = a.getAddress();
        if (b.length == 4) {
            final int o0 = b[0] & 0xFF;
            final int o1 = b[1] & 0xFF;
            // CGNAT 100.64.0.0/10 (Tailscale) — non couvert par isSiteLocalAddress().
            if (o0 == 100 && o1 >= 64 && o1 <= 127) {
                return true;
            }
        }
        // IPv6 Unique Local Address fc00::/7.
        return b.length == 16 && (b[0] & 0xFE) == 0xFC;
    }
}
