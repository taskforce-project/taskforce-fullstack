package com.taskforce.tf_api.core.api;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.boot.actuate.health.CompositeHealth;
import org.springframework.boot.actuate.health.HealthComponent;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.shared.dto.ApiResponse;

import lombok.RequiredArgsConstructor;

/**
 * Statut opérationnel (page « Status » des réglages).
 *
 * <p>Lit la santé <b>réelle</b> déjà agrégée par l'actuator Spring ({@link HealthEndpoint}) — DB,
 * cache, disque, etc. — plutôt que de pinger chaque service à la demande : ces indicateurs sont
 * calculés/mis en cache par Spring, donc <b>aucun overload</b> ni appel réseau supplémentaire.
 * L'endpoint est authentifié (préfixe {@code /api/**}) et ne renvoie que le code d'état par
 * composant (UP / DOWN / OUT_OF_SERVICE…), aucune donnée sensible.</p>
 */
@RestController
@RequestMapping("/api/status")
@RequiredArgsConstructor
public class StatusController {

    private final HealthEndpoint healthEndpoint;

    public record ComponentStatus(String key, String status) {}
    public record StatusResponse(String status, List<ComponentStatus> components) {}

    @GetMapping
    public ResponseEntity<ApiResponse<StatusResponse>> status() {
        HealthComponent health = healthEndpoint.health();
        String overall = health.getStatus().getCode();

        List<ComponentStatus> components = new ArrayList<>();
        if (health instanceof CompositeHealth composite && composite.getComponents() != null) {
            for (Map.Entry<String, HealthComponent> e : composite.getComponents().entrySet()) {
                components.add(new ComponentStatus(e.getKey(), e.getValue().getStatus().getCode()));
            }
        }
        return ResponseEntity.ok(ApiResponse.success("Statut", new StatusResponse(overall, components)));
    }
}
