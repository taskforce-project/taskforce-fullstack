package com.taskforce.tf_api.core.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.service.AiStatusService;
import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;
import com.taskforce.tf_api.shared.dto.ApiResponse;

import lombok.RequiredArgsConstructor;

/**
 * État de l'IA de l'instance, pour l'interface (« IA non configurée », modèles utilisés).
 * GET /api/ai/status — tout utilisateur connecté ; aucune URL ni clé n'est exposée.
 *
 * <p>{@code refresh=true} relit l'état sans attendre la fin du cache de 30 s : l'app desktop le demande juste après
 * un changement de fournisseur dans ses réglages. La relecture reste bon marché, l'ai-service gardant lui aussi son
 * état en cache.</p>
 */
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiStatusController {

    private final AiStatusService aiStatusService;

    @GetMapping("/status")
    public ResponseEntity<ApiResponse<AiStatus>> status(@RequestParam(defaultValue = "false") boolean refresh) {
        if (refresh) {
            aiStatusService.invalidate();
        }
        return ResponseEntity.ok(ApiResponse.success(aiStatusService.current()));
    }
}
