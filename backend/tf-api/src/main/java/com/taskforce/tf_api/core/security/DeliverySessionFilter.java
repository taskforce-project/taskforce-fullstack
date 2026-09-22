package com.taskforce.tf_api.core.security;

import java.io.IOException;
import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.taskforce.tf_api.core.service.delivery.DeliverySession;
import com.taskforce.tf_api.core.service.delivery.DeliverySessionScope;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerService;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerSettings;
import com.taskforce.tf_api.core.service.delivery.RunnerIdentity;
import com.taskforce.tf_api.core.service.delivery.RunnerIdentityResolver;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.security.PostAuthenticationFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

/**
 * Session déléguée d'un runner local (ADR-013) : le temps d'un run, l'agent agit <b>au nom du délégant</b>,
 * dans un périmètre resserré.
 *
 * <p>Pour un jeton d'utilisateur, ce filtre ne fait <b>rien</b>. Pour un jeton de runner (compte de
 * service Keycloak), il est <b>fail-closed</b> :</p>
 * <ol>
 *   <li>les endpoints machine ({@code /api/delivery/runner/**}) passent tels quels, ils font leur propre
 *       contrôle sur l'identité du runner ;</li>
 *   <li>tout autre chemin exige l'en-tête {@value #RUN_HEADER} désignant un run <b>en cours, réclamé par ce
 *       runner, délégué par son propriétaire</b>, et un couple méthode + chemin admis par
 *       {@link DeliverySessionScope} ;</li>
 *   <li>alors seulement le principal est remplacé par celui du délégant : les contrôleurs et les gardes
 *       RBAC existants s'appliquent sans modification, avec SES droits pour plafond.</li>
 * </ol>
 *
 * <p>Ce n'est pas l'usurpation générale écartée par l'ADR-011 (Token Exchange : le backend pouvait devenir
 * n'importe qui, n'importe quand). Ici l'identité empruntée est <b>unique et fixée par Keycloak</b> (claim
 * signé), elle n'existe que pendant un run que la personne a <b>elle-même</b> délégué, et elle est bornée
 * en durée comme en périmètre.</p>
 */
@Component
@ConditionalOnProperty(name = LocalRunnerSettings.ENABLED_PROPERTY, havingValue = "true")
@Slf4j
public class DeliverySessionFilter extends OncePerRequestFilter implements PostAuthenticationFilter {

    /** En-tête qui désigne le run dont la requête emprunte la session. */
    public static final String RUN_HEADER = "X-TaskForce-Delivery-Run";

    /** Endpoints machine du runner : authentifiés par son identité propre, sans délégation. */
    public static final String RUNNER_API_PREFIX = "/api/delivery/runner/";

    private final RunnerIdentityResolver identityResolver;
    private final LocalRunnerService localRunnerService;

    public DeliverySessionFilter(RunnerIdentityResolver identityResolver, LocalRunnerService localRunnerService) {
        this.identityResolver = identityResolver;
        this.localRunnerService = localRunnerService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken token) || !identityResolver.looksLikeRunner(token.getToken())) {
            chain.doFilter(request, response); // utilisateur (ou anonyme) : aucun changement
            return;
        }

        // À partir d'ici : jeton de runner. Tout ce qui n'est pas explicitement admis est refusé.
        String path = request.getRequestURI();
        if (path.startsWith(RUNNER_API_PREFIX)) {
            chain.doFilter(request, response);
            return;
        }

        DeliverySession session;
        try {
            RunnerIdentity runner = identityResolver.resolve(token.getToken());
            session = localRunnerService.openSession(parseRunId(request.getHeader(RUN_HEADER)), runner);
        } catch (ForbiddenException e) {
            deny(response, path, "session refusée");
            return;
        }
        if (!DeliverySessionScope.allows(request.getMethod(), path, session.workspaceSlug(), session.projectId())) {
            deny(response, path, "hors périmètre (run " + session.runId() + ")");
            return;
        }

        SecurityContext delegated = SecurityContextHolder.createEmptyContext();
        delegated.setAuthentication(delegatedAuthentication(token.getToken(), session));
        SecurityContextHolder.setContext(delegated);
        log.info("Session déléguée : run {} (runner {}) {} {}",
            session.runId(), session.runnerClientId(), request.getMethod(), forLog(path));
        chain.doFilter(request, response);
    }

    /**
     * Principal du délégant. Les contrôleurs résolvent l'utilisateur par le claim {@code email} (repli
     * {@code preferred_username} en dev) : on pose les deux. Aucun claim du jeton machine n'est repris, en
     * dehors de sa fenêtre de validité.
     */
    private Authentication delegatedAuthentication(Jwt machine, DeliverySession session) {
        Jwt.Builder builder = Jwt.withTokenValue(machine.getTokenValue())
            .header("alg", "none")
            .claim("email", session.ownerEmail())
            .claim("preferred_username", session.ownerEmail())
            .claim("tf_delivery_run", session.runId())
            .claim("tf_delivery_runner", session.runnerClientId());
        if (machine.getIssuedAt() != null) {
            builder.issuedAt(machine.getIssuedAt());
        }
        if (machine.getExpiresAt() != null) {
            builder.expiresAt(machine.getExpiresAt());
        }
        if (session.ownerKeycloakId() != null) {
            builder.subject(session.ownerKeycloakId());
        }
        return new JwtAuthenticationToken(builder.build(), List.of(), session.ownerEmail());
    }

    private Long parseRunId(String header) {
        if (header == null || header.isBlank() || header.length() > 19) {
            throw new ForbiddenException("En-tête de session absent");
        }
        try {
            return Long.valueOf(header.trim());
        } catch (NumberFormatException e) {
            throw new ForbiddenException("En-tête de session illisible");
        }
    }

    /** Neutralise les sauts de ligne d'une valeur issue de la requête avant de la journaliser (anti log-injection). */
    private static String forLog(String value) {
        if (value == null) return "null";
        String v = value.replaceAll("[\r\n\t]", "_");
        return v.length() > 200 ? v.substring(0, 200) + "…" : v;
    }

    /** Refus écrit à la main : une exception levée dans un filtre échappe au {@code @ControllerAdvice}. */
    private void deny(HttpServletResponse response, String path, String reason) throws IOException {
        log.warn("Jeton de runner refusé sur {} : {}", forLog(path), reason);
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"success\":false,\"message\":\"Accès refusé : hors de la session de délégation\"}");
    }
}
