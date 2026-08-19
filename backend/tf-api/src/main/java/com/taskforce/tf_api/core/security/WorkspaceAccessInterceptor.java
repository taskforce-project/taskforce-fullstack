package com.taskforce.tf_api.core.security;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Garde RBAC transverse (PROD-3.2) : exige l'appartenance au workspace pour toute
 * ressource sous {@code /api/workspaces/{slug}/...}. Ferme les IDOR de façon centralisée
 * (Analytics/Teams/Pages/Discussions/Projects/…), y compris les futurs endpoints.
 *
 * <p><b>Fail-open</b> sur incertitude : si l'utilisateur ou le workspace ne peuvent être
 * résolus (pas de JWT, user non provisionné, slug inconnu), on laisse passer — le contrôleur
 * gère (401/404). Un membre légitime passe toujours ; seul un non-membre est bloqué (403).</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class WorkspaceAccessInterceptor implements HandlerInterceptor {

    /** /api/workspaces/{slug}/<sous-ressource> — le sous-chemin est requis. */
    private static final Pattern WORKSPACE_SUBRESOURCE =
        Pattern.compile("^/api/workspaces/([^/]+)/.+$");

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final UserRepository userRepository;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        Matcher matcher = WORKSPACE_SUBRESOURCE.matcher(request.getRequestURI());
        if (!matcher.find()) {
            return true; // pas une sous-ressource de workspace
        }
        String slug = matcher.group(1);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt)) {
            return true; // non authentifié → laissé à la sécurité / contrôleur
        }

        String email = jwt.getClaimAsString("email");
        if (email == null || email.isBlank()) {
            email = jwt.getClaimAsString("preferred_username");
        }
        if (email == null || email.isBlank()) {
            return true;
        }

        Long userId = userRepository.findByEmail(email).map(u -> u.getId()).orElse(null);
        if (userId == null) {
            return true; // user non provisionné → fail-open
        }

        Long workspaceId = workspaceRepository.findBySlug(slug).map(w -> w.getId()).orElse(null);
        if (workspaceId == null) {
            return true; // workspace inconnu → 404 géré par le contrôleur
        }

        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, userId)) {
            log.warn("Accès refusé (non-membre) : user {} → workspace '{}'", userId, slug);
            throw new ForbiddenException("Accès refusé : vous n'êtes pas membre de cet espace de travail");
        }
        return true;
    }
}
