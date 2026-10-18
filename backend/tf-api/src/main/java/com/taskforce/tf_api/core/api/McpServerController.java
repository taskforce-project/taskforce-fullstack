package com.taskforce.tf_api.core.api;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.service.mcpserver.McpServerService;

import lombok.RequiredArgsConstructor;

/**
 * Serveur MCP de l'instance (OSS-5.2), un par workspace : {@code POST /api/workspaces/{slug}/mcp}.
 *
 * <p>Claude Code s'y branche en HTTP ({@code claude mcp add --transport http ...}) avec un jeton personnel ; le
 * runner y branche l'agent d'un run avec son jeton de session déléguée. C'est une route de <b>protocole</b> :
 * elle parle JSON-RPC 2.0, pas l'enveloppe {@code ApiResponse} des routes REST, et rend le JSON déjà sérialisé par
 * le service (cf. {@link McpServerService.Reply}).</p>
 *
 * <p>Sans état : pas de flux SSE ({@code GET} répond 405, comme le prévoit le transport « Streamable HTTP »), pas
 * d'identifiant de session à clore ({@code DELETE} répond 405).</p>
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/mcp")
@RequiredArgsConstructor
public class McpServerController {

    private final McpServerService mcpServerService;

    @PostMapping
    public ResponseEntity<String> message(
        @PathVariable String slug,
        @RequestBody(required = false) String body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        McpServerService.Reply reply = mcpServerService.reply(slug, jwt, body);
        if (reply.json() == null) {
            return ResponseEntity.status(reply.status()).build();
        }
        return ResponseEntity.status(reply.status()).contentType(MediaType.APPLICATION_JSON).body(reply.json());
    }

    @GetMapping
    public ResponseEntity<Void> stream() {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).header(HttpHeaders.ALLOW, "POST").build();
    }

    @DeleteMapping
    public ResponseEntity<Void> close() {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).header(HttpHeaders.ALLOW, "POST").build();
    }
}
