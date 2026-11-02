package com.taskforce.tf_api.core.security;

import java.util.Optional;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * L'agent qui agit pour la personne, quand la requête passe par la session déléguée d'une mission (ADR-013) : le
 * principal est alors celui du délégant, posé par {@link DeliverySessionFilter} avec le nom de l'agent du run. Les
 * services s'en servent pour dire, dans l'activité d'une issue, par qui l'action est passée (« Claude Code », au nom de
 * Pierre). Hors d'une session déléguée (la personne elle-même, un jeton personnel, une tâche de fond), rien.
 */
public final class DelegatedAgent {

    /** Le nom gardé quand un principal délégué ne porte pas celui de son agent. */
    static final String UNNAMED = "Agent";

    private DelegatedAgent() {}

    /** Le nom de l'agent de la session déléguée de la requête en cours, ou vide. */
    public static Optional<String> current() {
        return of(SecurityContextHolder.getContext().getAuthentication());
    }

    static Optional<String> of(Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken token)) return Optional.empty();
        Jwt principal = token.getToken();
        if (!principal.hasClaim(DeliverySessionFilter.RUN_CLAIM)) return Optional.empty();
        String agent = principal.getClaimAsString(DeliverySessionFilter.AGENT_CLAIM);
        return Optional.of(agent == null || agent.isBlank() ? UNNAMED : agent.strip());
    }
}
