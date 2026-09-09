package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.DeliveryProviderResponse;
import com.taskforce.tf_api.core.service.delivery.DeliveryAgentProviderRegistry;
import com.taskforce.tf_api.shared.dto.ApiResponse;

import lombok.RequiredArgsConstructor;

/**
 * Délégation à un agent de livraison (TF-AGENT-DELIVERY). Chemin scopé workspace
 * (garde d'appartenance assurée par l'interceptor sur {@code /api/workspaces/{slug}/**}).
 *
 * <p>Slice 2 : liste des providers délégables (pour le picker). Le dispatch d'une tâche arrive en slice 3.</p>
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/delivery")
@RequiredArgsConstructor
public class DeliveryController {

    private final DeliveryAgentProviderRegistry registry;

    /** GET /api/workspaces/{slug}/delivery/providers — providers disponibles pour la délégation. */
    @GetMapping("/providers")
    public ResponseEntity<ApiResponse<List<DeliveryProviderResponse>>> listProviders(
        @PathVariable String slug
    ) {
        List<DeliveryProviderResponse> providers = registry.all().stream()
            .map(p -> new DeliveryProviderResponse(
                p.key(), p.displayName(), p.logoKey(), p.available(), p.models()))
            .toList();
        return ResponseEntity.ok(ApiResponse.success("Providers récupérés", providers));
    }
}
