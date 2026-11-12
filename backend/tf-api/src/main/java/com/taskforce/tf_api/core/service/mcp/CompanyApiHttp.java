package com.taskforce.tf_api.core.service.mcp;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.security.SsrfGuard;

/**
 * Le client HTTP des API d'éditeurs que TaskForce sert lui-même (Google Drive, Microsoft Graph), sur le JDK
 * {@link HttpClient} (aucune dépendance ajoutée) : le jeton de la personne en {@code Authorization: Bearer}, jamais dans
 * un journal ni un message ; chaque adresse passe la garde anti-SSRF avant l'appel (sauf dans les essais de contrat, faux
 * éditeur sur 127.0.0.1) ; une réponse bornée ; une redirection suivie à la main, sans le jeton (un lien de
 * téléchargement présigné chez Microsoft).
 */
@Component
public class CompanyApiHttp {

    /** Le jeton n'est plus accepté : le renouveler, puis reconnecter. */
    public static class Unauthorized extends BusinessException {
        public Unauthorized() {
            super("The connection was refused: reconnect the tool.");
        }
    }

    /** L'éditeur refuse ou ne trouve pas : son statut, et ce qu'il en dit (sans jeton). */
    public static class VendorError extends BusinessException {
        private final int status;

        public VendorError(int status, String message) {
            super(message);
            this.status = status;
        }

        public int status() {
            return status;
        }
    }

    static final int MAX_BYTES = 10 * 1024 * 1024;
    private static final int MAX_ERROR = 300;

    private final HttpClient http;
    private final ObjectMapper objectMapper;
    private final boolean allowLocal;
    private final Duration timeout = Duration.ofSeconds(30);

    @Autowired
    public CompanyApiHttp(ObjectMapper objectMapper) {
        this(objectMapper, false);
    }

    /** Essais de contrat seulement : un faux éditeur sur 127.0.0.1. */
    public CompanyApiHttp(ObjectMapper objectMapper, boolean allowLocal) {
        this.objectMapper = objectMapper;
        this.allowLocal = allowLocal;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    }

    public JsonNode getJson(String url, String token) {
        return json(send(builder(url, token).GET(), url));
    }

    public JsonNode postJson(String url, String token, Object body) {
        return json(send(builder(url, token).header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(write(body), StandardCharsets.UTF_8)), url));
    }

    public JsonNode putBytes(String url, String token, byte[] body, String contentType) {
        return json(send(builder(url, token).header("Content-Type", contentType)
            .PUT(HttpRequest.BodyPublishers.ofByteArray(body)), url));
    }

    /** Un envoi {@code multipart/related} : la metadata en JSON, puis le contenu (l'envoi de Google Drive). */
    public JsonNode postRelated(String url, String token, Object metadata, byte[] content, String contentType) {
        String boundary = "tf-" + UUID.randomUUID();
        byte[] head = ("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + write(metadata)
            + "\r\n--" + boundary + "\r\nContent-Type: " + contentType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8);
        byte[] tail = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
        byte[] body = new byte[head.length + content.length + tail.length];
        System.arraycopy(head, 0, body, 0, head.length);
        System.arraycopy(content, 0, body, head.length, content.length);
        System.arraycopy(tail, 0, body, head.length + content.length, tail.length);
        return json(send(builder(url, token).header("Content-Type", "multipart/related; boundary=" + boundary)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body)), url));
    }

    /**
     * Le contenu d'un fichier, borné à {@code max} octets. Une redirection (un lien de téléchargement présigné) est suivie
     * une fois, sans le jeton.
     */
    public byte[] getBytes(String url, String token, int max) {
        HttpResponse<InputStream> r = sendStream(builder(url, token).GET(), url);
        if (r.statusCode() / 100 == 3) {
            String next = r.headers().firstValue("Location").orElse(null);
            close(r);
            if (next == null) throw new VendorError(r.statusCode(), "The file moved without saying where.");
            String target = URI.create(url).resolve(next).toString();
            r = sendStream(builder(target, null).GET(), target);
        }
        return bounded(r, max);
    }

    // -------------------------------------------------------------------------

    private HttpRequest.Builder builder(String url, String token) {
        if (!allowLocal) SsrfGuard.assertPublicHttpUrl(url);
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).timeout(timeout).header("Accept", "application/json");
        if (token != null) b.header("Authorization", "Bearer " + token);
        return b;
    }

    private HttpResponse<String> send(HttpRequest.Builder b, String url) {
        try {
            HttpResponse<String> r = http.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            check(r.statusCode(), r.body());
            return r;
        } catch (IOException e) {
            throw new BusinessException("The tool didn't answer: " + host(url));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException("Interrupted");
        }
    }

    private HttpResponse<InputStream> sendStream(HttpRequest.Builder b, String url) {
        try {
            HttpResponse<InputStream> r = http.send(b.build(), HttpResponse.BodyHandlers.ofInputStream());
            if (r.statusCode() / 100 != 2 && r.statusCode() / 100 != 3) {
                String body = new String(bounded(r, 4096), StandardCharsets.UTF_8);
                check(r.statusCode(), body);
            }
            return r;
        } catch (IOException e) {
            throw new BusinessException("The tool didn't answer: " + host(url));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException("Interrupted");
        }
    }

    private static byte[] bounded(HttpResponse<InputStream> r, int max) {
        try (InputStream in = r.body()) {
            byte[] read = in.readNBytes(max + 1);
            if (read.length > max) throw new BusinessException("This file is too large for TaskForce to read.");
            return read;
        } catch (IOException e) {
            throw new BusinessException("The file couldn't be read: " + e.getMessage());
        }
    }

    private static void close(HttpResponse<InputStream> r) {
        try {
            r.body().close();
        } catch (IOException e) {
            // rien à faire
        }
    }

    private void check(int status, String body) {
        if (status / 100 == 2) return;
        if (status == 401) throw new Unauthorized();
        throw new VendorError(status, vendorMessage(status, body));
    }

    /** Ce que l'éditeur dit de son refus, court : le message de Google ou de Microsoft, sinon le statut. */
    String vendorMessage(int status, String body) {
        String said = null;
        try {
            JsonNode err = objectMapper.readTree(body == null ? "" : body).path("error");
            said = err.isTextual() ? err.asText() : err.path("message").asText(null);
        } catch (IOException | RuntimeException e) {
            said = null;
        }
        if (said == null || said.isBlank()) said = "status " + status;
        return said.length() > MAX_ERROR ? said.substring(0, MAX_ERROR) : said;
    }

    private JsonNode json(HttpResponse<String> r) {
        String body = r.body();
        if (body == null || body.isBlank()) return objectMapper.createObjectNode();
        try {
            return objectMapper.readTree(body);
        } catch (IOException e) {
            throw new BusinessException("The tool's answer isn't readable.");
        }
    }

    private String write(Object body) {
        try {
            return objectMapper.writeValueAsString(body);
        } catch (IOException e) {
            throw new BusinessException("The request couldn't be written.");
        }
    }

    private static String host(String url) {
        try {
            return URI.create(url).getHost();
        } catch (IllegalArgumentException e) {
            return "the tool";
        }
    }

}
