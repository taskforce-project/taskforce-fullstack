package com.taskforce.tf_api.core.desktop;

import java.io.IOException;
import java.util.Set;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Profil {@code desktop} : réglages fournis par la coque, vérifiés au démarrage, et garde de l'en-tête {@code Host}.
 */
@Configuration
@Profile("desktop")
@EnableConfigurationProperties(DesktopProperties.class)
public class DesktopConfig {

    /** Noms d'hôte admis : l'API n'écoute que sur 127.0.0.1, la coque la joint par l'un de ces deux noms. */
    static final Set<String> LOCAL_HOSTS = Set.of("127.0.0.1", "localhost");

    /** Longueur minimale du jeton de lancement, préfixe compris (la coque tire 32 octets aléatoires). */
    static final int MIN_LAUNCH_TOKEN_LENGTH = 40;

    public DesktopConfig(DesktopProperties properties) {
        validate(properties);
    }

    /**
     * Refuse de démarrer sans ce que la coque doit fournir : un backend desktop sans jeton fort ou sans compte
     * servirait l'API à n'importe quel processus de la machine, ou à personne.
     */
    static void validate(DesktopProperties properties) {
        String token = properties.launchToken();
        if (token == null || !token.startsWith(DesktopProperties.LAUNCH_TOKEN_PREFIX) || token.length() < MIN_LAUNCH_TOKEN_LENGTH) {
            throw new IllegalStateException("desktop.launch-token is missing or too short: the desktop shell must provide it");
        }
        DesktopProperties.Account account = properties.account();
        if (account == null || isBlank(account.subject()) || isBlank(account.email())) {
            throw new IllegalStateException("desktop.account.subject and desktop.account.email are required: the desktop shell must provide them");
        }
        if (isBlank(properties.dataDir())) {
            throw new IllegalStateException("desktop.data-dir is required: the desktop shell must provide it");
        }
    }

    /**
     * Refuse toute requête dont l'en-tête {@code Host} n'est pas local. Une page web ouverte dans un navigateur de la
     * machine peut viser 127.0.0.1 par un nom de domaine qui y pointe (rebinding DNS) : son {@code Host} la trahit.
     * Placé avant tout autre filtre, CORS et sécurité compris.
     */
    @Bean
    public FilterRegistrationBean<OncePerRequestFilter> desktopHostFilter() {
        FilterRegistrationBean<OncePerRequestFilter> registration = new FilterRegistrationBean<>(new LocalHostFilter());
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        registration.addUrlPatterns("/*");
        return registration;
    }

    static final class LocalHostFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            if (!LOCAL_HOSTS.contains(request.getServerName())) {
                // Réponse écrite ici : sendError renverrait vers /error, une route protégée qui répondrait 401.
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("text/plain");
                response.getWriter().write("Forbidden");
                return;
            }
            chain.doFilter(request, response);
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
