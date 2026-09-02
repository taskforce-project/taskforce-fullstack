package com.taskforce.tf_api.core.api;

import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.service.mcp.McpOAuthService;

import lombok.RequiredArgsConstructor;

/**
 * Callback OAuth des serveurs MCP (TF-MCP-02). Endpoint <b>public</b> : le serveur d'autorisation y
 * redirige le navigateur apres consentement. Tout est resolu depuis le {@code state} (stocke cote
 * serveur, anti-CSRF), jamais depuis un parametre devinable. Repond <b>toujours</b> par une
 * redirection vers l'UI (succes ou erreur), jamais une erreur brute.
 */
@RestController
@RequestMapping("/api/mcp/oauth")
@RequiredArgsConstructor
public class McpOAuthCallbackController {

    private final McpOAuthService mcpOAuthService;

    @GetMapping("/callback")
    public ResponseEntity<Void> callback(
        @RequestParam(required = false) String code,
        @RequestParam(required = false) String state,
        @RequestParam(required = false) String error
    ) {
        String redirect = mcpOAuthService.callback(state, code, error);
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(redirect)).build();
    }
}
