package com.taskforce.tf_api.shared.security;

import jakarta.servlet.Filter;

/**
 * Point d'extension : filtre exécuté dans la chaîne protégée, <b>juste après</b> l'authentification du
 * bearer et avant l'autorisation. {@link SecurityConfig} y branche tous les beans de ce type.
 *
 * <p>Existe pour respecter le sens des couches ({@code shared ← core}) : un filtre qui a besoin du
 * domaine (ex. la session déléguée d'un runner, ADR-013) vit dans {@code core} et implémente ce contrat,
 * sans que {@code shared} ne dépende de lui.</p>
 *
 * <p>⚠️ Un bean {@code Filter} est aussi enregistré d'office par Spring Boot dans la chaîne servlet, donc
 * AVANT l'authentification. Toute implémentation doit désactiver cet enregistrement par un
 * {@code FilterRegistrationBean} ({@code setEnabled(false)}).</p>
 */
public interface PostAuthenticationFilter extends Filter {
}
