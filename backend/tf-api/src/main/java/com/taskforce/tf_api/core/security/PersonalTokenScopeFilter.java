package com.taskforce.tf_api.core.security;

import java.io.IOException;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.taskforce.tf_api.shared.security.PostAuthenticationFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

/**
 * Borne un jeton personnel (OSS-5.1) au serveur MCP de l'instance : {@code /api/workspaces/{slug}/mcp}, rien d'autre.
 *
 * <p>Liste d'autorisation, fail-closed : un jeton personnel ne crée ni ne révoque de jeton, ne touche ni au compte,
 * ni aux membres, ni aux intégrations, y compris sur les futurs endpoints. Sur le serveur MCP, chaque outil applique
 * ensuite les droits de la personne. Pour toute autre authentification (session du navigateur, runner), ce filtre
 * ne fait rien.</p>
 */
@Component
@Slf4j
public class PersonalTokenScopeFilter extends OncePerRequestFilter implements PostAuthenticationFilter {

    private static final Pattern MCP_PATH = Pattern.compile("^/api/workspaces/[A-Za-z0-9_-]{1,100}/mcp$");
    private static final Set<String> MCP_METHODS = Set.of("POST", "GET", "DELETE");

    /** Vrai si un jeton personnel peut porter cette requête. */
    public static boolean allows(String method, String path) {
        return method != null && path != null
            && MCP_METHODS.contains(method.toUpperCase())
            && MCP_PATH.matcher(path).matches();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean personalToken = auth instanceof JwtAuthenticationToken token
            && token.getToken().hasClaim(PersonalTokenAuthenticator.TOKEN_CLAIM);
        if (personalToken && !allows(request.getMethod(), request.getRequestURI())) {
            log.warn("Personal access token refused outside the MCP server: {} {}", request.getMethod(),
                forLog(request.getRequestURI()));
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write(
                "{\"success\":false,\"message\":\"Access denied: personal access tokens only work with the MCP server\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    /** Neutralise les sauts de ligne d'une valeur issue de la requête avant de la journaliser. */
    private static String forLog(String value) {
        if (value == null) return "null";
        String v = value.replaceAll("[\r\n\t]", "_");
        return v.length() > 200 ? v.substring(0, 200) + "..." : v;
    }
}
