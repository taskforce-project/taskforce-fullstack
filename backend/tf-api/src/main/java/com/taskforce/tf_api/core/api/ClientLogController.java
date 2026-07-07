package com.taskforce.tf_api.core.api;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.ClientLogRequest;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Journalisation serveur des erreurs client (E25 — supervision/journalisation).
 *
 * <p>Le frontend remonte ses erreurs (window.onerror, rejets non gérés, ErrorBoundary) ici ; on les
 * écrit dans les logs applicatifs (Slf4j → OTEL/SigNoz), avec l'utilisateur si un JWT est présent.
 * <b>Journalisation « classique » uniquement — pas d'audit</b> (l'audit reste réservé aux actions
 * métier/sécurité). Endpoint tolérant : renvoie toujours 200 (best-effort côté client).</p>
 */
@RestController
@RequestMapping("/api/logs")
@RequiredArgsConstructor
@Slf4j
public class ClientLogController {

    private final JwtIdentityResolver identityResolver;

    @PostMapping("/client")
    public ResponseEntity<ApiResponse<Void>> ingest(
        @Valid @RequestBody ClientLogRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        String user = "anonymous";
        if (jwt != null) {
            try { user = identityResolver.resolveEmail(jwt); } catch (Exception ignored) { /* best-effort */ }
        }

        String base = String.format("[client] user=%s source=%s : %s",
            user, sanitize(request.getSource()), sanitize(request.getMessage()));

        if ("warn".equalsIgnoreCase(request.getLevel())) {
            log.warn(base);
        } else {
            // Défaut = error. Stack incluse si fournie (déjà bornée à 8000 par @Size).
            if (request.getStack() != null && !request.getStack().isBlank()) {
                log.error("{}\n{}", base, sanitize(request.getStack()));
            } else {
                log.error(base);
            }
        }
        return ResponseEntity.ok(ApiResponse.success("logged", null));
    }

    /** Neutralise les retours à la ligne/CR pour éviter l'injection de fausses lignes de log (log forging). */
    private String sanitize(String value) {
        if (value == null) return "";
        return value.replace('\n', ' ').replace('\r', ' ');
    }
}
