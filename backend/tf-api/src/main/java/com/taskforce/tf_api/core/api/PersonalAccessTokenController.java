package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.HttpStatus;
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

import com.taskforce.tf_api.core.dto.request.CreatePersonalAccessTokenRequest;
import com.taskforce.tf_api.core.dto.response.CreatedPersonalAccessTokenResponse;
import com.taskforce.tf_api.core.dto.response.PersonalAccessTokenResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.PersonalAccessTokenService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Jetons personnels de la personne connectée (OSS-5.1). Un jeton personnel ne peut pas appeler ces routes (il ne
 * sert que sur le serveur MCP, cf. {@code PersonalTokenScopeFilter}) : seule une vraie session en crée ou en révoque.
 */
@RestController
@RequestMapping("/api/users/me/tokens")
@RequiredArgsConstructor
public class PersonalAccessTokenController {

    private final PersonalAccessTokenService tokenService;
    private final UserRepository userRepository;
    private final JwtIdentityResolver identityResolver;

    /** GET /api/users/me/tokens : jetons non révoqués, sans leur valeur. */
    @GetMapping
    public ResponseEntity<ApiResponse<List<PersonalAccessTokenResponse>>> list(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success("Access tokens retrieved", tokenService.list(resolveUserId(jwt))));
    }

    /** POST /api/users/me/tokens : crée un jeton ; sa valeur n'est rendue qu'ici. */
    @PostMapping
    public ResponseEntity<ApiResponse<CreatedPersonalAccessTokenResponse>> create(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody CreatePersonalAccessTokenRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Access token created", tokenService.create(resolveUserId(jwt), request)));
    }

    /** DELETE /api/users/me/tokens/{tokenId} : révoque le jeton, effet immédiat. */
    @DeleteMapping("/{tokenId}")
    public ResponseEntity<ApiResponse<Void>> revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable Long tokenId) {
        tokenService.revoke(resolveUserId(jwt), tokenId);
        return ResponseEntity.ok(ApiResponse.success("Access token revoked", null));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = identityResolver.resolveEmail(jwt);
        return userRepository.findByEmail(email).map(User::getId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }
}
