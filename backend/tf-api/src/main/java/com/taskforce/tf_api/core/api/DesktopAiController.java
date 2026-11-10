package com.taskforce.tf_api.core.api;

import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.desktop.DesktopAiService;
import com.taskforce.tf_api.core.dto.request.DesktopAiSettingsRequest;
import com.taskforce.tf_api.core.dto.response.DesktopAiStateResponse;
import com.taskforce.tf_api.shared.dto.ApiResponse;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Le fournisseur d'IA de l'app desktop, pour sa coque seule (en-tête {@value #SHELL_HEADER}, en plus du jeton de
 * lancement) : l'écran de réglages en lit l'état, et un changement de fournisseur vaut sans redémarrer le backend.
 */
@RestController
@Profile("desktop")
@RequestMapping("/api/desktop/ai")
@RequiredArgsConstructor
public class DesktopAiController {

    /** En-tête qui porte le secret de la coque. */
    public static final String SHELL_HEADER = "X-TaskForce-Shell";

    private final DesktopAiService desktopAi;

    /** GET /api/desktop/ai : le fournisseur répond-il, quels modèles il annonce, lesquels servent. */
    @GetMapping
    public ResponseEntity<ApiResponse<DesktopAiStateResponse>> state(
        @RequestHeader(value = SHELL_HEADER, required = false) String shell,
        @RequestParam(defaultValue = "false") boolean fresh
    ) {
        return ResponseEntity.ok(ApiResponse.success(desktopAi.state(shell, fresh)));
    }

    /** PUT /api/desktop/ai : le fournisseur et les modèles choisis par la personne, clé comprise. */
    @PutMapping
    public ResponseEntity<ApiResponse<DesktopAiStateResponse>> apply(
        @RequestHeader(value = SHELL_HEADER, required = false) String shell,
        @Valid @RequestBody DesktopAiSettingsRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success("AI provider changed", desktopAi.apply(shell, request.variables())));
    }
}
