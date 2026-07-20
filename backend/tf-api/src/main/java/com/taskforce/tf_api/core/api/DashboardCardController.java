package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.CreateDashboardCardRequest;
import com.taskforce.tf_api.core.dto.request.ReorderDashboardCardsRequest;
import com.taskforce.tf_api.core.dto.request.UpdateDashboardCardRequest;
import com.taskforce.tf_api.core.dto.response.DashboardCardResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.DashboardCardService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Cartes de dashboard épinglées d'un membre dans un workspace. Le GET bootstrappe les 4 cartes
 * par défaut au premier accès (persistant — donc supprimables ensuite).
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/dashboard-cards")
@RequiredArgsConstructor
public class DashboardCardController {

    private final DashboardCardService dashboardCardService;
    private final UserRepository       userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<List<DashboardCardResponse>>> listCards(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success("Cartes du dashboard récupérées",
            dashboardCardService.list(slug, resolveUserId(jwt))));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<DashboardCardResponse>> createCard(
        @PathVariable String slug,
        @Valid @RequestBody CreateDashboardCardRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Carte ajoutée",
            dashboardCardService.create(slug, resolveUserId(jwt), request)));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<ApiResponse<DashboardCardResponse>> updateCard(
        @PathVariable String slug,
        @PathVariable Long id,
        @Valid @RequestBody UpdateDashboardCardRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success("Carte mise à jour",
            dashboardCardService.update(slug, resolveUserId(jwt), id, request)));
    }

    @PutMapping("/reorder")
    public ResponseEntity<ApiResponse<List<DashboardCardResponse>>> reorderCards(
        @PathVariable String slug,
        @Valid @RequestBody ReorderDashboardCardsRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success("Cartes réordonnées",
            dashboardCardService.reorder(slug, resolveUserId(jwt), request.getOrderedIds())));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteCard(
        @PathVariable String slug,
        @PathVariable Long id,
        @AuthenticationPrincipal Jwt jwt
    ) {
        dashboardCardService.delete(slug, resolveUserId(jwt), id);
        return ResponseEntity.ok(ApiResponse.success("Carte retirée", null));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
