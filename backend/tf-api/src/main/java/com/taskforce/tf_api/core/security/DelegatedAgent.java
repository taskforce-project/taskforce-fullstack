package com.taskforce.tf_api.core.security;

import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * L'agent qui agit pour la personne, quand la requête passe par la session déléguée d'une mission (ADR-013) : le
 * principal est alors celui du délégant, posé par {@link DeliverySessionFilter} avec le nom de l'agent du run. Les
 * services s'en servent pour dire, dans l'activité d'une issue, par qui l'action est passée (« Claude Code », au nom de
 * Pierre). Hors d'une session déléguée (la personne elle-même, un jeton personnel, une tâche de fond), rien.
 *
 * <p>Cortex aussi agit pour la personne : un geste qu'il fait dans la conversation (ADR-024) passe par
 * {@link #actingAs}, et l'activité dit « Cortex », au nom de la personne, comme pour l'agent d'une mission. Le modèle qui
 * le fait parler s'y ajoute ({@link #withModel}) : son commentaire dit « Cortex · qwen3:8b » (R123, séance n°18).</p>
 */
public final class DelegatedAgent {

    /** Le nom gardé quand un principal délégué ne porte pas celui de son agent. */
    static final String UNNAMED = "Agent";

    /** L'agent qui fait, dans ce fil, un geste au nom de la personne connectée (Cortex, dans la conversation). */
    private static final ThreadLocal<String> ACTING = new ThreadLocal<>();
    /** Le modèle qui fait parler cet agent, dans ce fil : celui qui a répondu à la personne. */
    private static final ThreadLocal<String> MODEL = new ThreadLocal<>();

    private DelegatedAgent() {}

    /** Le nom de l'agent qui agit pour la personne dans la requête en cours, ou vide. */
    public static Optional<String> current() {
        String acting = ACTING.get();
        if (acting != null) return Optional.of(acting);
        return of(SecurityContextHolder.getContext().getAuthentication());
    }

    /**
     * Fait {@code action} au nom de la personne connectée, par l'agent {@code agent} : ce que l'action garde dans
     * l'activité d'une issue le dit. Le nom ne vaut que pendant l'action, dans ce fil.
     */
    public static <T> T actingAs(String agent, Supplier<T> action) {
        String before = ACTING.get();
        ACTING.set(agent);
        try {
            return action.get();
        } finally {
            if (before == null) ACTING.remove();
            else ACTING.set(before);
        }
    }

    /** Le modèle qui fait parler l'agent de ce fil (Cortex : celui qui a répondu à la personne), ou vide. */
    public static Optional<String> model() {
        String model = MODEL.get();
        return model == null || model.isBlank() ? Optional.empty() : Optional.of(model.strip());
    }

    /**
     * Fait {@code action} avec le modèle {@code model} : ce qu'un agent y écrit pour la personne garde le nom du modèle
     * qui le faisait parler (R123). Le nom ne vaut que pendant l'action, dans ce fil ; un modèle nul n'en pose aucun.
     */
    public static <T> T withModel(String model, Supplier<T> action) {
        String before = MODEL.get();
        if (model == null) MODEL.remove();
        else MODEL.set(model);
        try {
            return action.get();
        } finally {
            if (before == null) MODEL.remove();
            else MODEL.set(before);
        }
    }

    static Optional<String> of(Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken token)) return Optional.empty();
        Jwt principal = token.getToken();
        if (!principal.hasClaim(DeliverySessionFilter.RUN_CLAIM)) return Optional.empty();
        String agent = principal.getClaimAsString(DeliverySessionFilter.AGENT_CLAIM);
        return Optional.of(agent == null || agent.isBlank() ? UNNAMED : agent.strip());
    }
}
