package com.taskforce.tf_api.core.api;

import java.util.ArrayList;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.shared.dto.ApiResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Statut opérationnel (page « Status » des réglages) — vérifications <b>légères et sûres, sans
 * overload</b> : l'API est « up » dès lors que cette requête répond, et la base est sondée par un
 * simple {@code SELECT 1} (local, instantané). On ne fait <b>aucun ping réseau</b> vers des services
 * externes (IA / Keycloak) à chaque chargement : ce serait de la latence et de la charge inutiles.
 * Enrichissement possible plus tard (cache, IA, Keycloak) via de vrais indicateurs, ou l'agrégat
 * Prometheus/Grafana pour un état « dégradé » sur seuil.
 */
@RestController
@RequestMapping("/api/status")
@RequiredArgsConstructor
@Slf4j
public class StatusController {

    private final JdbcTemplate jdbcTemplate;

    public record ComponentStatus(String key, String status) {}
    public record StatusResponse(String status, List<ComponentStatus> components) {}

    @GetMapping
    public ResponseEntity<ApiResponse<StatusResponse>> status() {
        List<ComponentStatus> components = new ArrayList<>();

        // Base de données : sonde légère (local, ~instantané).
        String db = "UP";
        try {
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
        } catch (Exception e) {
            db = "DOWN";
            log.warn("Sonde DB (SELECT 1) en échec : {}", e.getMessage());
        }
        components.add(new ComponentStatus("db", db));

        boolean allUp = components.stream().allMatch(c -> "UP".equals(c.status()));
        return ResponseEntity.ok(ApiResponse.success("Statut", new StatusResponse(allUp ? "UP" : "DOWN", components)));
    }
}
