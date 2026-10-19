package com.taskforce.tf_api.modules.ged.api;

import java.io.InputStream;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.modules.ged.service.LocalObjectStorage;

import lombok.RequiredArgsConstructor;

/**
 * Sert les fichiers de l'app desktop aux liens signés de {@link LocalObjectStorage}, à la place des liens présignés de
 * MinIO. Pas de jeton : le lien s'ouvre dans une balise {@code <img>} ou un nouvel onglet ; la signature et
 * l'expiration le protègent.
 *
 * <p>Ces fichiers sont envoyés par les personnes et servis depuis l'origine de l'app : seuls les types qui
 * s'affichent sans script (images matricielles, PDF) sont rendus en ligne, tout le reste est téléchargé, et la
 * politique de sécurité du contenu interdit tout script.</p>
 */
@RestController
@Profile("desktop")
@RequestMapping(LocalObjectStorage.OBJECT_ROUTE)
@RequiredArgsConstructor
public class DesktopObjectController {

    static final Set<String> INLINE_TYPES = Set.of(
        "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "application/pdf");

    private final LocalObjectStorage storage;

    @GetMapping
    public ResponseEntity<InputStreamResource> get(
        @RequestParam String key,
        @RequestParam long expires,
        @RequestParam String signature
    ) {
        if (!storage.isValidLink(key, expires, signature)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        InputStream stream;
        try {
            stream = storage.getObjectStream(key);
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
        String type = storage.contentType(key);
        String name = key.substring(key.lastIndexOf('/') + 1);
        ContentDisposition disposition = (INLINE_TYPES.contains(type)
            ? ContentDisposition.inline() : ContentDisposition.attachment()).filename(name).build();
        return ResponseEntity.ok()
            .contentType(INLINE_TYPES.contains(type) ? MediaType.parseMediaType(type) : MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
            .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
            .header("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
            .body(new InputStreamResource(stream));
    }
}
