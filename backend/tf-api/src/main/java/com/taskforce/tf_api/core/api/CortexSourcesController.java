package com.taskforce.tf_api.core.api;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.CortexSourcesResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.agent.CortexSourcesService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Ce que Cortex peut lire dans un espace (R125, séance n°18) : ses sources, comptées et datées, pour le volet
 * « Progress ». Une lecture ; le service vérifie l'espace, puis la visibilité de chaque projet et de chaque note.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/assistant/sources")
@RequiredArgsConstructor
public class CortexSourcesController {

    private final CortexSourcesService sourcesService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<CortexSourcesResponse>> sources(@PathVariable String slug,
                                                                      @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(sourcesService.sources(slug, resolveUserId(jwt))));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return user.getId();
    }
}
