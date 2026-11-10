package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.IssueCommentHitResponse;
import com.taskforce.tf_api.core.dto.response.IssueHitResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.IssueCommentSearchService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * La recherche d'issues de la fenêtre (R123, R124, séance n°18) : Ctrl+K trouve une issue par sa clé ou son titre et
 * l'ouvre dans le volet, le « @ » et le « + » du compositeur la joignent à une demande à Cortex. Toutes les issues des
 * projets que la personne voit, en un appel, quel que soit le nombre de projets.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/issues")
@RequiredArgsConstructor
public class IssueSearchController {

    /** Le texte cherché au plus : une clé ou quelques mots d'un titre. */
    static final int MAX_QUERY = 100;

    private final IssueService issueService;
    private final IssueCommentSearchService commentSearchService;
    private final UserRepository userRepository;

    /**
     * GET /api/workspaces/{slug}/issues/search?q=OPS-35&limit=8 : les issues qui répondent, la clé exacte d'abord ; sans
     * {@code q}, les dernières changées. {@code limit} : 8 par défaut, 20 au plus.
     */
    @GetMapping("/search")
    public ResponseEntity<ApiResponse<List<IssueHitResponse>>> search(
        @PathVariable String slug,
        @RequestParam(name = "q", defaultValue = "") String q,
        @RequestParam(name = "limit", defaultValue = "8") int limit,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        String query = q.length() > MAX_QUERY ? q.substring(0, MAX_QUERY) : q;
        return ResponseEntity.ok(ApiResponse.success("Issues found", issueService.searchIssues(slug, userId, query, limit)));
    }

    /**
     * GET /api/workspaces/{slug}/issues/search/comments?q=deploy&limit=5 : les issues dont un commentaire répond (Ctrl+K,
     * R141), sur les projets que la personne voit, une ligne par issue, avec le passage qui répond. {@code limit} : 5 par
     * défaut, 20 au plus.
     */
    @GetMapping("/search/comments")
    public ResponseEntity<ApiResponse<List<IssueCommentHitResponse>>> searchComments(
        @PathVariable String slug,
        @RequestParam(name = "q", defaultValue = "") String q,
        @RequestParam(name = "limit", defaultValue = "5") int limit,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        String query = q.length() > MAX_QUERY ? q.substring(0, MAX_QUERY) : q;
        return ResponseEntity.ok(ApiResponse.success("Comments found", commentSearchService.search(slug, userId, query, limit)));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return user.getId();
    }
}
