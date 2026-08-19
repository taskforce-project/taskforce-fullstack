package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.SkillSuggestionRequest;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.SkillSuggestionService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Suggestion IA de compétences pour l'onboarding — alimente ensuite {@link MemberSkillController}.
 *
 * <p>Contrôleur séparé volontairement : n'ajoute aucune dépendance au constructeur de
 * {@code MemberSkillController} (donc aucun test WebMvc existant à retoucher).</p>
 *
 * Route : {@code POST /api/workspaces/{slug}/skills/suggestions}  {role, existingSkills?} → liste de tags.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/skills")
@RequiredArgsConstructor
public class SkillSuggestionController {

    private final SkillSuggestionService suggestionService;
    private final UserRepository userRepository;

    @PostMapping("/suggestions")
    public ResponseEntity<ApiResponse<List<String>>> suggest(
        @PathVariable String slug,
        @Valid @RequestBody SkillSuggestionRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long requesterId = resolveUserId(jwt);
        List<String> suggestions = suggestionService.suggest(
            slug, request.getRole(), request.getExistingSkills(), requesterId);
        return ResponseEntity.ok(ApiResponse.success("Suggestions de compétences", suggestions));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        return userRepository.findByEmail(email)
            .map(User::getId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }
}
