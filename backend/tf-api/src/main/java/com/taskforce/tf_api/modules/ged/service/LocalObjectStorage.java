package com.taskforce.tf_api.modules.ged.service;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.desktop.DesktopProperties;

/**
 * Stockage des fichiers de l'app desktop : un dossier {@code files} dans le dossier de données du compte, à la place
 * de MinIO (spec Specification_App_Desktop §5.2). Le type de contenu est gardé à côté du fichier.
 *
 * <p>Les liens de téléchargement remplacent les liens présignés de MinIO : une route du backend local
 * ({@code /api/files/objects}) sert le fichier si le lien porte une signature HMAC valide et non expirée. La clé de
 * signature est le jeton de lancement : un lien ne survit pas à un redémarrage de l'app, comme un lien présigné
 * expire au bout d'une heure.</p>
 */
@Service
@Profile("desktop")
public class LocalObjectStorage implements ObjectStorage {

    /** Route qui sert les fichiers aux liens signés (cf. {@code DesktopObjectController}). */
    public static final String OBJECT_ROUTE = "/api/files/objects";

    static final Duration LINK_LIFETIME = Duration.ofHours(1);
    private static final String TYPE_SUFFIX = ".content-type";
    private static final String DEFAULT_TYPE = "application/octet-stream";

    private final Path root;
    private final byte[] signingKey;
    private final String apiUrl;
    private final Clock clock;

    @Autowired
    public LocalObjectStorage(DesktopProperties properties, @Value("${app.api-url}") String apiUrl) {
        this(Path.of(properties.dataDir(), "files"), properties.launchToken(), apiUrl, Clock.systemUTC());
    }

    LocalObjectStorage(Path root, String signingKey, String apiUrl, Clock clock) {
        this.root = root.toAbsolutePath().normalize();
        this.signingKey = signingKey.getBytes(StandardCharsets.UTF_8);
        this.apiUrl = apiUrl.endsWith("/") ? apiUrl.substring(0, apiUrl.length() - 1) : apiUrl;
        this.clock = clock;
    }

    @Override
    public void upload(String objectKey, InputStream stream, long size, String contentType) {
        Path file = resolve(objectKey);
        try {
            Files.createDirectories(file.getParent());
            Files.copy(stream, file, StandardCopyOption.REPLACE_EXISTING);
            Files.writeString(typeFile(file), contentType == null || contentType.isBlank() ? DEFAULT_TYPE : contentType);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not store " + objectKey, e);
        }
    }

    @Override
    public String presignedGetUrl(String objectKey) {
        resolve(objectKey);
        long expires = clock.instant().plus(LINK_LIFETIME).getEpochSecond();
        return apiUrl + OBJECT_ROUTE
            + "?key=" + URLEncoder.encode(objectKey, StandardCharsets.UTF_8)
            + "&expires=" + expires
            + "&signature=" + sign(objectKey, expires);
    }

    @Override
    public void delete(String objectKey) {
        Path file = resolve(objectKey);
        try {
            Files.deleteIfExists(file);
            Files.deleteIfExists(typeFile(file));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not delete " + objectKey, e);
        }
    }

    @Override
    public String contentType(String objectKey) {
        try {
            return Files.readString(typeFile(resolve(objectKey))).trim();
        } catch (IOException | RuntimeException e) {
            return DEFAULT_TYPE;
        }
    }

    @Override
    public InputStream getObjectStream(String objectKey) {
        try {
            return Files.newInputStream(resolve(objectKey));
        } catch (IOException e) {
            throw new RuntimeException("Object not found: " + objectKey, e);
        }
    }

    /** Vrai si le lien est signé par cette app et n'a pas expiré. */
    public boolean isValidLink(String objectKey, long expires, String signature) {
        if (signature == null || clock.instant().getEpochSecond() > expires) {
            return false;
        }
        return MessageDigest.isEqual(
            sign(objectKey, expires).getBytes(StandardCharsets.UTF_8),
            signature.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Chemin du fichier d'une clé, toujours sous le dossier des fichiers : une clé qui en sortirait
     * ({@code ../}, chemin absolu, lecteur Windows) est refusée. Les clés de l'app ({@code issues/1/<uuid>.pdf})
     * n'ont jamais de deux-points ni d'antislash : les refuser rend la règle identique sous Windows et Linux.
     */
    Path resolve(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            throw new IllegalArgumentException("Empty object key");
        }
        if (objectKey.startsWith("/") || objectKey.contains(":") || objectKey.contains("\\")) {
            throw new IllegalArgumentException("Invalid object key");
        }
        Path file = root.resolve(objectKey).normalize();
        if (!file.startsWith(root) || file.equals(root) || file.getFileName().toString().endsWith(TYPE_SUFFIX)) {
            throw new IllegalArgumentException("Invalid object key");
        }
        return file;
    }

    private static Path typeFile(Path file) {
        return file.resolveSibling(file.getFileName() + TYPE_SUFFIX);
    }

    private String sign(String objectKey, long expires) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingKey, "HmacSHA256"));
            byte[] digest = mac.doFinal((objectKey + "\n" + expires).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }
}
