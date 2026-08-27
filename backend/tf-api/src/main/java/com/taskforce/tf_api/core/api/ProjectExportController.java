package com.taskforce.tf_api.core.api;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.ProjectExport;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.ProjectExportService;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Export COMPLET d'un projet (issues + descriptions + commentaires + activité) en JSON ou CSV (P1b bêta) —
 * pour reprendre son travail ailleurs à la fermeture de la bêta.
 *
 * <p>Réponse en <b>téléchargement</b> ({@code Content-Disposition: attachment}, contenu brut) : exception
 * assumée à l'enveloppe {@code ApiResponse} (c'est un fichier, pas une réponse d'API). L'autorisation
 * (visibilité projet) est portée par {@link ProjectExportService} via {@code IssueService}.</p>
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/projects/{projectId}/export")
@RequiredArgsConstructor
public class ProjectExportController {

    private final ProjectExportService exportService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<?> export(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @RequestParam(defaultValue = "json") String format,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        ProjectExport export = exportService.export(slug, projectId, userId);
        String base = export.identifier() + "-export";

        if ("csv".equalsIgnoreCase(format)) {
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + base + ".csv\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(exportService.toCsv(export));
        }
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + base + ".json\"")
            .contentType(MediaType.APPLICATION_JSON)
            .body(export);
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        return userRepository.findByEmail(email).map(User::getId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }
}
