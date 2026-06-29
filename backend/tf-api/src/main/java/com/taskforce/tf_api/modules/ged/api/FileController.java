package com.taskforce.tf_api.modules.ged.api;

import java.io.InputStream;

import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.modules.ged.service.MinioService;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Proxy pour servir les fichiers stockés dans Minio sans exposer les URLs Minio directement.
 * GET /api/files/avatars/{userId}  → avatar de l'utilisateur
 */
@RestController
@RequestMapping("/api/files")
@RequiredArgsConstructor
public class FileController {

    private final MinioService minioService;
    private final UserRepository userRepository;

    /**
     * Sert l'avatar d'un utilisateur depuis Minio.
     * Pas d'auth requise — les avatars sont publics dans le contexte d'une app interne.
     */
    @GetMapping("/avatars/{userId}")
    public ResponseEntity<InputStreamResource> getAvatar(@PathVariable Long userId) {
        String user_avatarUrl = userRepository.findById(userId)
            .map(u -> u.getAvatarUrl())
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable : " + userId));

        // L'avatarUrl stocké est soit un chemin Minio proxy, soit une URL externe
        // On extrait la clé Minio à partir du path /api/files/avatars/{userId}
        String objectKey = "avatars/" + userId + "/avatar";

        try {
            InputStream stream = minioService.getObjectStream(objectKey);
            return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "max-age=86400, public")
                .contentType(MediaType.IMAGE_JPEG)
                .body(new InputStreamResource(stream));
        } catch (Exception e) {
            // Fallback : redirect vers dicebear si pas d'avatar Minio
            String name = user_avatarUrl != null ? user_avatarUrl : "user" + userId;
            return ResponseEntity.status(302)
                .header(HttpHeaders.LOCATION, "https://api.dicebear.com/9.x/identicon/svg?seed=" + userId)
                .build();
        }
    }

    /**
     * Sert une pièce jointe Brain OS (image/document) depuis Minio.
     * Public (proxy par clé UUID inguessable) pour permettre l'affichage via &lt;img&gt; et
     * l'ouverture directe des documents — cf. PUBLIC_MATCHERS "/api/files/brain/**".
     */
    @GetMapping("/brain/{workspaceId}/{name}")
    public ResponseEntity<InputStreamResource> getBrainFile(
        @PathVariable Long workspaceId,
        @PathVariable String name
    ) {
        String objectKey = "brain/" + workspaceId + "/" + name;
        try {
            String ct = minioService.contentType(objectKey);
            InputStream stream = minioService.getObjectStream(objectKey);
            return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "max-age=86400, public")
                .contentType(MediaType.parseMediaType(ct != null && !ct.isBlank() ? ct : "application/octet-stream"))
                .body(new InputStreamResource(stream));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }
}
