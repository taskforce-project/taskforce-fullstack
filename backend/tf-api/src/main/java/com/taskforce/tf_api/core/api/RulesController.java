package com.taskforce.tf_api.core.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.RuleCheckRequest;
import com.taskforce.tf_api.core.dto.request.RuleDraftRequest;
import com.taskforce.tf_api.core.dto.response.RulesResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.rules.RulesService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/**
 * Les règles de l'entreprise, par couches (R157) : les lire, en écrire une en mots, la vérifier, la retirer, et essayer
 * une action (« What would happen? »). Le service vérifie l'espace et les droits ; tout membre lit, les propriétaires et
 * administrateurs écrivent, et le responsable d'un projet écrit la couche de ce projet.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/rules")
@RequiredArgsConstructor
@Validated
public class RulesController {

    private final RulesService rules;
    private final UserRepository userRepository;
    private final JwtIdentityResolver identityResolver;

    @GetMapping
    public ResponseEntity<ApiResponse<RulesResponse.Overview>> listRules(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(rules.overview(slug, resolveUserId(jwt))));
    }

    /**
     * Traduit une règle écrite en mots avec le modèle de l'espace, puis la vérifie sans lui ; avec une traduction déjà
     * faite, la vérifie seulement. Rien n'est écrit.
     */
    @PostMapping("/drafts")
    public ResponseEntity<ApiResponse<RulesResponse.Draft>> draftRule(
        @PathVariable String slug, @Valid @RequestBody RuleDraftRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(rules.draft(slug, resolveUserId(jwt), body)));
    }

    /**
     * Ajoute la règle vérifiée à sa couche, dans une nouvelle version. Une règle qui ne passe pas ses cas, ou qui
     * relâcherait le socle, n'entre pas : la réponse le dit, avec la vérification (422).
     */
    @PostMapping
    public ResponseEntity<ApiResponse<RulesResponse.Draft>> addRule(
        @PathVariable String slug, @Valid @RequestBody RuleDraftRequest body, @AuthenticationPrincipal Jwt jwt) {
        RulesService.Saved saved = rules.add(slug, resolveUserId(jwt), body);
        if (!saved.saved()) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(ApiResponse.error("This rule can't be added as it is.", saved.draft()));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(saved.draft()));
    }

    /** Retire une règle de sa couche : une nouvelle version, sans elle. */
    @DeleteMapping("/{group}")
    public ResponseEntity<ApiResponse<Void>> removeRule(
        @PathVariable String slug,
        @PathVariable @Pattern(regexp = "[a-z0-9][a-z0-9-]{1,79}") String group,
        @RequestParam @Pattern(regexp = "workspace|project|process|role|person") String scope,
        @RequestParam(required = false) @Size(max = 80) String ref,
        @AuthenticationPrincipal Jwt jwt) {
        rules.remove(slug, resolveUserId(jwt), scope, ref, group);
        return ResponseEntity.ok(ApiResponse.success("Rule removed", null));
    }

    /** « What would happen? » : l'action décrite, telle que TaskForce la lit, et ce que les règles en décideraient. */
    @PostMapping("/check")
    public ResponseEntity<ApiResponse<RulesResponse.Check>> checkAction(
        @PathVariable String slug, @Valid @RequestBody RuleCheckRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(rules.check(slug, resolveUserId(jwt), body)));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = identityResolver.resolveEmail(jwt);
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return user.getId();
    }
}
